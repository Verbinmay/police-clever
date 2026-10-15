import { Composer } from "telegraf";
import type { BotContext } from "../../bot-context.ts";
import type { PartDefinition, PartSetupContext } from "../../bot-part.ts";
import { config as appConfig } from "../../config.ts";
import type { AiUsageKind } from "../../db/entities/AiUsage.ts";
import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import { cropTextForMessage } from "../../shared/crop-text-for-message.ts";
import { displayName, getThreadId, isGroupChat } from "../../shared/telegram.ts";
import { type AiClient, createAiClient } from "./ai-client.ts";
import { estimateCostUsd, isOverMonthlyBudget } from "./budget.ts";
import { loadAiConfig } from "./config.ts";
import { isOnCooldown, markCooldown } from "./cooldown.ts";
import { buildChatContext, buildSystemPrompt, buildUserContent } from "./dialog.ts";
import type { AiConfig } from "./default-config.ts";
import { apiKeyEnvVar, type ProviderId } from "./providers.ts";
import { resetGachaCounter, rollGacha } from "./gacha.ts";
import { pickAction } from "./scenario.ts";
import { getRandomStickerFileId } from "./stickers.ts";

function toThreadIdParam(threadId: string): number | undefined {
	return threadId === "0" ? undefined : Number(threadId);
}

function pickRandom<T>(items: T[]): T {
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return items[Math.floor(Math.random() * items.length)]!;
}

const FILLER_WORDS = new Set(["эй", "ну", "слышь", "алло", "ало", "ау", "ой", "так", "вот"]);

/** Есть ли в тексте обращения что-то кроме самого имени и междометий — тогда отвечаем по существу. */
function hasMeaningfulWords(text: string): boolean {
	return text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.some((word) => word.length >= 3 && !FILLER_WORDS.has(word));
}

const API_KEYS: Record<ProviderId, string> = {
	deepseek: appConfig.DEEPSEEK_API_KEY,
	openai: appConfig.OPENAI_API_KEY,
};

/**
 * AI-шутки: бот следит за разговором и иногда встревает — по имени (любое
 * из нескольких триггер-слов, безусловно) или сам (пассивная "гача"), со
 * сценарием из общего пула (см. scenario.ts — раньше пул был разбит на
 * категории тона со своими весами, по прямому требованию тоны убраны
 * целиком) — плюс лёгкий бесплатный флейвор на "да"/"нет" (свой тумблер,
 * не расходует AI-бюджет, работает независимо от AI-шуток).
 *
 * Что общее, а что на ТЕМУ — сознательно по-разному:
 *  - Кулдаун между AI-ответами (cooldown.ts) и дневной кап
 *    (dailyCallCapPerChat) — НА ВЕСЬ ЧАТ. Это рычаги стоимости: если бы
 *    они были на тему, чат с 5 активными темами генерил бы в 5 раз больше
 *    AI-ответов за то же время, чем чат с одной — ровно то, чего нельзя
 *    допускать (иначе владельца легко "обонкротить", просто включив
 *    AI-шутки в кучe тем).
 *  - Счётчик пассивной гачи (gacha.ts) — ОДИН НА ВЕСЬ БОТ, все чаты
 *    вместе. Раньше был на тему — но независимые счётчики на каждый
 *    включённый чат по сути размножали общую частоту срабатываний
 *    пропорционально числу чатов (те же 5 тем — 5 параллельных гонок к
 *    порогу). Единый розыгрыш честнее и предсказуемее по частоте.
 *  - Глобальный месячный $ потолок (budget.ts) — НА ВЕСЬ БОТ, все чаты
 *    вместе.
 *
 * Роллинг-саммари темы (был отдельный periodic-вызов, обновлял короткую
 * сводку раз в N сообщений) — вырезан целиком. На практике сводка чаще
 * вредила, чем помогала: ставилась первой в userContent, звучала как
 * авторитетная рамка, а обновлялась реже, чем менялась реальная тема
 * разговора — ответы держались за устаревшую тему из сводки, хотя сырой
 * хвост сообщений уже давно ушёл дальше. Сейчас единственный источник
 * контекста — сырой хвост сообщений (buildChatContext, dialog.ts).
 *
 * Когда лимит исчерпан, но позвали ПО ИМЕНИ (не гачей) — вместо тишины
 * отправляется случайный стикер из заранее заданного стикерпака
 * (stickers.ts) со своим отдельным коротким кулдауном (тоже на весь чат),
 * чтобы спам триггер-словом не превращался в спам стикерами.
 *
 * Провайдер (DeepSeek/OpenAI) переключается в панели без передеплоя —
 * оба клиента собираются один раз при старте (если ключ задан в env), а
 * дальше на каждый вызов выбирается активный по AiConfig.provider.
 *
 * Каждый реальный AI-ответ (промпт + отправленный контекст + сам текст)
 * пишется в AiUsage — это и есть "лог ответов" в панели ("Ответы AI"), не
 * только счётчики токенов.
 */
export function createAiFunPart(): PartDefinition {
	return {
		id: "ai-fun",
		setup({ repos, logger }: PartSetupContext) {
			const composer = new Composer<BotContext>();

			// Не кэшируем клиента по id провайдера: baseURL/модель редактируются
			// в панели без передеплоя, а конструирование OpenAI-клиента не
			// делает сетевых запросов — кэш только рисковал бы держать
			// устаревшие baseURL/модель после правки в конфиге.
			function getClient(config: AiConfig, provider: ProviderId): AiClient | null {
				const apiKey = API_KEYS[provider];
				if (!apiKey) {
					logger.error(`Провайдер "${provider}" выбран активным, но ${apiKeyEnvVar(provider)} не задан в env`, { provider });
					return null;
				}
				return createAiClient(config.providers[provider], apiKey, provider);
			}

			async function sendFallbackSticker(ctx: BotContext, settings: SettingsRepository, config: AiConfig, chatId: string, threadId: string) {
				if (!config.stickerPackShortName) return;
				if (await isOnCooldown(settings, chatId, config.stickerCooldownMinutes, "sticker")) return;

				const fileId = await getRandomStickerFileId(ctx.telegram, config.stickerPackShortName, logger);
				if (!fileId) return;

				await ctx.replyWithSticker(fileId, { message_thread_id: toThreadIdParam(threadId) }).catch(() => {});
				await markCooldown(settings, chatId, "sticker");
				logger.info("Sent fallback sticker (AI limit reached)", { chatId, threadId });
			}

			composer.on("text", async (ctx, next) => {
				const chat = ctx.chat;
				if (!isGroupChat(chat)) return next();

				const chatId = String(chat.id);
				const threadId = getThreadId(ctx);

				// Реплай на сообщение бота — сигнал, что ответ зацепил (для
				// статистики сценариев в панели). В форум-темах reply_to_message
				// без явного реплая указывает на служебное сообщение создания
				// темы — его автор не бот, так что под условие оно не попадает.
				const repliedTo = ctx.message.reply_to_message;
				if (repliedTo?.from?.id && repliedTo.from.id === ctx.botInfo?.id) {
					await repos.aiUsage.incrementReplies(chatId, String(repliedTo.message_id)).catch((err) => logger.warn("Не удалось учесть реплай на ответ бота", { chatId }, err));
				}

				const topic = await repos.topics.get(chatId, threadId);
				if (!topic) return next();

				const text = ctx.message.text;
				const config = await loadAiConfig(repos.settings);

				// Бесплатный флейвор — свой тумблер, независимый от AI-шуток, не
				// расходует AI-бюджет и не участвует в кулдауне.
				if (topic.yesNoEnabled) {
					const normalized = text.trim().toLowerCase();
					if (normalized === "да" || normalized === "нет") {
						if (Math.random() < config.yesNoReplyProbability) {
							const answer = normalized === "да" ? pickRandom(config.yesAnswers) : pickRandom(config.noAnswers);
							await ctx.reply(answer, { message_thread_id: toThreadIdParam(threadId) }).catch(() => {});
						}
						return next();
					}
				}

				if (!topic.aiJokesEnabled) return next();

				const aiClient = getClient(config, config.provider);

				// Регистронезависимо — "Реван"/"реван"/"РЕВАН" все должны срабатывать одинаково.
				const lowerText = text.toLowerCase();
				const isTriggered = config.triggerWords.some((word) => word && lowerText.includes(word.toLowerCase()));
				// Вызов по имени сбрасывает общий счётчик гачи наравне с пассивным
				// выигрышем — иначе счётчик тикает сам по себе, и "гарантированный"
				// ответ может выпасть почти сразу после того, как бота уже позвали
				// вручную (см. gacha.ts). Сбрасываем на факт обращения, не дожидаясь
				// успеха самого AI-вызова — это отсчёт активности, а не награда.
				if (isTriggered) await resetGachaCounter(repos.settings);
				const wantsGacha = !isTriggered && (await rollGacha(repos.settings, config));
				if (!isTriggered && !wantsGacha) return next();

				if (!aiClient) return next(); // провайдер выбран, но ключ не настроен — уже залогировано выше

				// Кулдаун и дневной кап — на весь чат (см. комментарий у функции), не на тему.
				let blockedReason: "cooldown" | "daily_cap" | "monthly_budget" | null = null;
				if (await isOnCooldown(repos.settings, chatId, config.cooldownMinutes)) blockedReason = "cooldown";
				else if ((await repos.aiUsage.countLast24h(chatId)) >= config.dailyCallCapPerChat) blockedReason = "daily_cap";
				else if (await isOverMonthlyBudget(repos.aiUsage, config.monthlyBudgetUsd)) blockedReason = "monthly_budget";

				if (blockedReason) {
					logger.debug("AI reply skipped", { chatId, threadId, reason: blockedReason });
					// Гачу лимит просто гасит молча — её никто явно не просил. А вот
					// если позвали по имени и уткнулись в лимит, отвечаем хотя бы
					// стикером, чтобы не выглядело так, будто бот не услышал.
					if (isTriggered) await sendFallbackSticker(ctx, repos.settings, config, chatId, threadId);
					return next();
				}

				const kind: AiUsageKind = isTriggered ? "trigger" : "gacha";
				const botName = displayName(ctx.botInfo) ?? "бот";
				const botTgId = ctx.botInfo?.id ? String(ctx.botInfo.id) : undefined;
				const context = await buildChatContext(repos.messages, chatId, threadId, config, botName, botTgId);

				// Раньше триггер по имени получал только голую инструкцию "тебе
				// написали, ответь" — без сценария на выбор, в отличие от гачи
				// (там их всегда 20+ на выбор). На практике это и давало самые
				// пресные ответы в логе ("Она всегда была слишком наблюдательной"
				// и т.п.) — без творческой установки модель откатывается на
				// нейтральную вежливую фразу. Теперь сценарий выбирается всегда,
				// для обоих видов — просто для триггера сверху добавляется
				// требование остаться по существу того, что реально написали.
				//
				// preferredTarget — тот, кто позвал бота: без этого {target}
				// сценария выбирался случайно из последних 20 активных, и ответ
				// раздваивался (по существу — про позвавшего, шутка сценария —
				// про кого-то третьего). См. scenario.ts.
				const addressorName = isTriggered ? (displayName(ctx.from) ?? undefined) : undefined;
				const picked = await pickAction(repos.settings, config, context.activeParticipants, addressorName);

				// Если триггер-сообщение — реплай, само по себе оно часто
				// бессмысленно без цитаты ("а он тебе на это что скажет?") — без
				// неё модель отвечает вслепую и скатывается в общие фразы.
				// caption — на случай реплая на фото/видео с подписью, а не
				// на чистый текст.
				const replyTo = ctx.message.reply_to_message;
				const quotedText = replyTo && ("text" in replyTo ? replyTo.text : "caption" in replyTo ? replyTo.caption : undefined);
				const replyContext = quotedText
					? ` Это реплай на сообщение ${displayName("from" in replyTo && replyTo.from ? replyTo.from : undefined) ?? "кого-то"}: "${quotedText}".`
					: "";

				// Голое обращение ("Реня" без ничего ещё) не даёт модели ничего,
				// к чему привязать "ответь по существу" — кроме случая, когда это
				// реплай (тогда цитата и есть содержание). Раньше порог был 12
				// символов, и короткие, но содержательные обращения ("Реня
				// манда", "Реня ты где") уходили в ветку "позвали без повода" —
				// бот отвечал мимо сказанного. Теперь содержание — любое слово
				// из 3+ букв после вычета имени, кроме пустых междометий.
				const strippedText = config.triggerWords
					.reduce((acc, word) => {
						if (!word) return acc;
						const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
						return acc.replace(new RegExp(escaped, "gi"), "");
					}, text)
					.trim();
				const hasRealContent = hasMeaningfulWords(strippedText) || Boolean(quotedText);

				const action = isTriggered
					? hasRealContent
						? `Тебе написали: "${text}"${replyContext} — ответь по существу этого. ${picked.action}`
						: `Тебя просто позвали по имени без повода — ответь в характере, как будто тебя дёрнули без дела. ${picked.action}`
					: picked.action;
				const prompt = buildSystemPrompt(config, action);
				const userContent = buildUserContent(context);

				const reply = await aiClient.getReply(prompt, userContent, logger, config.maxTokens);
				if (!reply) {
					logger.warn("AI request produced no reply", { chatId, threadId, kind });
					// Реальный сбой вызова (сеть/провайдер), а не блокировка лимитами —
					// раньше тут не было даже стикера-заглушки, при живом баге (см.
					// ai-client.ts) это означало полное молчание на прямое обращение.
					if (isTriggered) await sendFallbackSticker(ctx, repos.settings, config, chatId, threadId);
					return next();
				}

				// Кулдаун ставим только на реально состоявшийся ответ — неудачный
				// запрос (сеть/лимиты провайдера) не должен сжигать окно.
				await markCooldown(repos.settings, chatId);

				// Ответ — реплаем на то, к чему он относится: на вызов по имени —
				// на сам вызов, на шутку про {target} — на его последнее
				// сообщение, иначе — на последнее сообщение чата (текущее). Без
				// этого в активном чате было непонятно, кому и на что бот
				// отвечает. allow_sending_without_reply — если сообщение успели
				// удалить, ответ всё равно уйдёт, просто без цитаты.
				const replyToMessageId = (!isTriggered && picked.target && context.lastMessageIdByName[picked.target]) || String(ctx.message.message_id);
				let botMessageId: string | null = null;
				for (const chunk of cropTextForMessage(reply.text)) {
					const sent: { message_id: number } | null = await ctx.telegram
						.sendMessage(chatId, chunk, {
							message_thread_id: toThreadIdParam(threadId),
							reply_parameters: botMessageId ? undefined : { message_id: Number(replyToMessageId), allow_sending_without_reply: true },
						})
						.catch((err) => {
							logger.warn("Не удалось отправить AI-ответ", { chatId, threadId }, err);
							return null;
						});
					if (sent && !botMessageId) botMessageId = String(sent.message_id);
				}

				// Свои же реплики бот раньше нигде не сохранял (messages.save
				// вызывает только core на ВХОДЯЩИХ апдейтах, а это прямой исходящий
				// вызов) — из-за этого сводка и сырой контекст были "слепы" к
				// собственным словам бота, не только к чужим. botName исключён из
				// activeParticipants в buildChatContext — бот не должен шутить/
				// докапываться сам на себя.
				await repos.messages.save({ chatId, threadId, tgId: botTgId ?? "0", fromName: botName, text: reply.text, messageId: botMessageId });

				const costUsd = estimateCostUsd(reply.promptTokens, reply.completionTokens, config.providers[config.provider]);
				await repos.aiUsage.record({
					chatId,
					threadId,
					kind,
					provider: config.provider,
					promptText: prompt,
					userContent,
					replyText: reply.text,
					promptTokens: reply.promptTokens,
					completionTokens: reply.completionTokens,
					costUsd,
					scenario: picked.template,
					model: reply.model,
					latencyMs: reply.latencyMs,
					botMessageId,
				});
				logger.info("AI replied", { chatId, threadId, kind, provider: config.provider, costUsd, latencyMs: reply.latencyMs });

				return next();
			});

			// Реакции на ответы бота — главный сигнал "зашло/не зашло" для
			// статистики сценариев. Любая реакция считается плюсом. Приходят,
			// только если бот админ и "message_reaction" есть в allowed_updates
			// вебхука (см. create-bot-app.ts). Реакции на чужие сообщения тоже
			// прилетают — addReactions просто не найдёт записи и ничего не
			// изменит.
			composer.on("message_reaction", async (ctx, next) => {
				const update = ctx.update.message_reaction;
				const delta = update.new_reaction.length - update.old_reaction.length;
				if (delta !== 0) {
					await repos.aiUsage
						.addReactions(String(update.chat.id), String(update.message_id), delta)
						.catch((err) => logger.warn("Не удалось учесть реакцию", { chatId: String(update.chat.id) }, err));
				}
				return next();
			});

			// Анонимные реакции (от имени чата/канала) — приходят итоговым числом по каждой эмодзи.
			composer.on("message_reaction_count", async (ctx, next) => {
				const update = ctx.update.message_reaction_count;
				const total = update.reactions.reduce((sum, r) => sum + r.total_count, 0);
				await repos.aiUsage
					.setReactions(String(update.chat.id), String(update.message_id), total)
					.catch((err) => logger.warn("Не удалось учесть реакции", { chatId: String(update.chat.id) }, err));
				return next();
			});

			logger.info("ai-fun part ready");
			return composer;
		},
	};
}
