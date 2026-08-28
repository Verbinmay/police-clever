import { randomUUID } from "node:crypto";
import { Composer } from "telegraf";
import type { BotContext } from "../../bot-context.ts";
import type { PartDefinition, PartSetupContext } from "../../bot-part.ts";
import { displayName, getThreadId, isGroupChat } from "../../shared/telegram.ts";
import { loadMuteVoteConfig } from "./config.ts";
import { voteKeyboard, voteText } from "./format.ts";
import { muteUser } from "./mute.ts";

/**
 * Голосование за мьют — единственная форма модерации в этой версии бота
 * (взамен всего старого /mute /unmute /setAdmin и т.д.): реплай спецфразой
 * на сообщение нарушителя поднимает 5-минутное голосование inline-
 * кнопками "Да"/"Нет". Один голос на пользователя (уникальность на уровне
 * БД, см. MuteVoteBallot). При кворуме "да" (и да>нет) — мьют немедленно,
 * не дожидаясь конца окна.
 */
export function createMuteVotePart(): PartDefinition {
	return {
		id: "mute-vote",
		setup({ repos, logger }: PartSetupContext) {
			const composer = new Composer<BotContext>();
			const timers = new Map<string, NodeJS.Timeout>();

			function clearTimer(voteId: string) {
				const timer = timers.get(voteId);
				if (timer) {
					clearTimeout(timer);
					timers.delete(voteId);
				}
			}

			async function finalizeVote(telegram: BotContext["telegram"], voteId: string) {
				const vote = await repos.muteVotes.findById(voteId);
				if (!vote || vote.status !== "open") return;
				clearTimer(voteId);

				const config = await loadMuteVoteConfig(repos.settings);
				const { yes, no } = await repos.muteVotes.countBallots(voteId);
				const targetLabel = vote.targetName ?? "цель";

				if (yes >= config.quorum && yes > no) {
					const muted = await muteUser(telegram, vote.chatId, vote.targetTgId, config.muteMinutes, logger);
					await repos.muteVotes.setStatus(voteId, "muted");
					await telegram
						.editMessageText(
							vote.chatId,
							vote.messageId,
							undefined,
							voteText(targetLabel, yes, no, config, muted ? `🔇 Замьючен на ${config.muteMinutes} мин.` : "⚠️ Не удалось замьютить (возможно, это админ чата)."),
						)
						.catch(() => {});
					logger.info("Mute vote succeeded", { voteId, chatId: vote.chatId, target: vote.targetTgId, yes, no, muted });
				} else {
					await repos.muteVotes.setStatus(voteId, "expired");
					await telegram
						.editMessageText(vote.chatId, vote.messageId, undefined, voteText(targetLabel, yes, no, config, "⏱ Голосование окончено — кворум не набран."))
						.catch(() => {});
					logger.info("Mute vote expired", { voteId, chatId: vote.chatId, target: vote.targetTgId, yes, no });
				}
			}

			// Запуск голосования: реплай спецфразой на сообщение нарушителя.
			composer.on("text", async (ctx, next) => {
				const chat = ctx.chat;
				if (!isGroupChat(chat)) return next();

				const chatId = String(chat.id);
				const threadId = getThreadId(ctx);
				const topic = await repos.topics.get(chatId, threadId);
				if (!topic?.muteVoteEnabled) return next();

				const config = await loadMuteVoteConfig(repos.settings);
				const text = ctx.message.text.trim();
				if (text !== config.triggerPhrase) return next();

				const replyTo = ctx.message.reply_to_message;
				const target = replyTo && "from" in replyTo ? replyTo.from : undefined;
				if (!target || target.is_bot) {
					await ctx.reply("Спецфразу нужно отправить реплаем на сообщение живого участника.", { message_thread_id: threadId === "0" ? undefined : Number(threadId) }).catch(() => {});
					return;
				}
				if (String(target.id) === String(ctx.from?.id)) {
					await ctx.reply("Себя так не замьютить 🙂", { message_thread_id: threadId === "0" ? undefined : Number(threadId) }).catch(() => {});
					return;
				}

				const existing = await repos.muteVotes.findOpenByTarget(chatId, threadId, String(target.id));
				if (existing) {
					await ctx.reply("По этому участнику уже идёт голосование.", { message_thread_id: threadId === "0" ? undefined : Number(threadId) }).catch(() => {});
					return;
				}

				const targetName = displayName(target) ?? `id${target.id}`;
				const expiresAt = new Date(Date.now() + config.windowMinutes * 60 * 1000);

				// voteId генерируем сами (не ждём БД), чтобы клавиатура сразу
				// содержала настоящие callback_data. Запись в БД создаём только
				// ПОСЛЕ успешной отправки сообщения — если отправка упадёт (сеть,
				// права бота и т.д.), не остаётся "зависшего" голоса без сообщения
				// и без таймера истечения.
				const voteId = randomUUID();
				let sent: Awaited<ReturnType<typeof ctx.reply>>;
				try {
					sent = await ctx.reply(voteText(targetName, 0, 0, config), {
						message_thread_id: threadId === "0" ? undefined : Number(threadId),
						...voteKeyboard(voteId),
					});
				} catch (err) {
					logger.error("Failed to send mute-vote message", { chatId, threadId, target: String(target.id) }, err);
					return;
				}

				const vote = await repos.muteVotes.open({
					id: voteId,
					chatId,
					threadId,
					targetTgId: String(target.id),
					targetName,
					requestedByTgId: String(ctx.from?.id ?? ""),
					messageId: sent.message_id,
					expiresAt,
				});

				const timer = setTimeout(() => finalizeVote(ctx.telegram, vote.id), config.windowMinutes * 60 * 1000);
				timers.set(vote.id, timer);

				logger.info("Mute vote opened", { voteId: vote.id, chatId, threadId, target: String(target.id), requestedBy: ctx.from?.id });
			});

			// Голос по кнопке. answerCbQuery — это просто "часики" в интерфейсе
			// Telegram у нажавшего кнопку; её обязательно оборачиваем в catch и
			// вызываем ПОСЛЕ основной логики (учёт голоса, проверка кворума,
			// мьют) — иначе сбой этого чисто косметического вызова оборвал бы
			// обработчик до того, как реально что-то произошло.
			composer.on("callback_query", async (ctx, next) => {
				const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
				if (!data?.startsWith("mv:")) return next();

				const [, voteId, choiceRaw] = data.split(":");
				const choice = choiceRaw === "yes" ? "yes" : choiceRaw === "no" ? "no" : null;
				if (!voteId || !choice) {
					await ctx.answerCbQuery().catch(() => {});
					return;
				}

				const vote = await repos.muteVotes.findById(voteId);
				if (!vote || vote.status !== "open") {
					await ctx.answerCbQuery("Голосование уже завершено.").catch(() => {});
					return;
				}

				const voterId = String(ctx.from.id);
				const accepted = await repos.muteVotes.castBallot(voteId, voterId, choice);
				if (!accepted) {
					await ctx.answerCbQuery("Вы уже проголосовали.").catch(() => {});
					return;
				}

				const { yes, no } = await repos.muteVotes.countBallots(voteId);
				const config = await loadMuteVoteConfig(repos.settings);
				const targetLabel = vote.targetName ?? "цель";

				if (yes >= config.quorum && yes > no) {
					await finalizeVote(ctx.telegram, voteId);
				} else {
					await ctx.telegram
						.editMessageText(vote.chatId, vote.messageId, undefined, voteText(targetLabel, yes, no, config), { reply_markup: voteKeyboard(voteId).reply_markup })
						.catch(() => {});
				}

				await ctx.answerCbQuery("Голос принят.").catch(() => {});
			});

			logger.info("mute-vote part ready");
			return composer;
		},
	};
}
