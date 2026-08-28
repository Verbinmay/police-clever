import { Composer } from "telegraf";
import type { BotContext } from "../../bot-context.ts";
import type { PartDefinition, PartSetupContext } from "../../bot-part.ts";
import { displayName, getThreadId, getTopicName, isGroupChat } from "../../shared/telegram.ts";

/**
 * Не "часть" в смысле панели (нет своего тумблера — всегда активна),
 * собрана Composer-паттерном для единообразия. На каждое сообщение из
 * группы/супергруппы:
 *  1. Пассивно регистрирует Chat и Topic (аналог
 *     `topics-repository.ensureRegistered` из bots-platform) — по
 *     умолчанию оба тумблера темы выключены, бот молчит, пока superadmin
 *     не включит её в панели ("подчаты добавляются через админку").
 *  2. Обновляет BotUser (кто бота видел — для панели).
 *  3. Логирует текст в Message, но только если у темы включён хотя бы
 *     один из тумблеров — иначе выключенная тема не копит вообще ничего.
 *
 * Сообщения от других ботов игнорируются полностью (return без next()) —
 * Telegram доставляет сообщения ЛЮБЫХ ботов в общем чате (не только
 * людей), и без этой проверки чужой бот в том же чате регистрировался бы
 * как обычный участник, засорял историю, а его текст мог бы случайно
 * содержать триггер-слово и вызвать AI-ответ на чужого бота.
 *
 * Плюс одна-единственная команда `/th <имя>` — Telegram присылает имя
 * форум-темы боту только служебным сообщением при её создании или
 * переименовании; для тем старше бота имя неоткуда взять без ручного
 * ввода. `/th <имя>`, написанная прямо в теме, регистрирует её (если ещё
 * не была видна) и/или переименовывает — без похода в панель.
 */
export function createCorePart(): PartDefinition {
	return {
		id: "core",
		setup({ repos, logger }: PartSetupContext) {
			const composer = new Composer<BotContext>();

			composer.use(async (ctx, next) => {
				const from = ctx.from;
				const chat = ctx.chat;
				if (!from || !isGroupChat(chat)) return next();
				// Не next() — сообщение от чужого бота не должно долетать вообще
				// ни до какой части (ai-fun/mute-vote тоже смотрят ctx.from).
				if (from.is_bot) return;

				const chatId = String(chat.id);
				const threadId = getThreadId(ctx);

				await repos.chats.ensureRegistered({
					chatId,
					title: "title" in chat ? (chat.title ?? null) : null,
					isForum: "is_forum" in chat ? Boolean(chat.is_forum) : false,
				});
				const topic = await repos.topics.ensureRegistered({ chatId, threadId, topicName: getTopicName(ctx) });

				await repos.users.touch({ tgId: String(from.id), username: from.username ?? null, firstName: from.first_name ?? null });

				const text = ctx.message && "text" in ctx.message ? ctx.message.text : undefined;
				if (text && (topic.aiJokesEnabled || topic.muteVoteEnabled)) {
					await repos.messages.save({ chatId, threadId, tgId: String(from.id), fromName: displayName(from), text });
				}

				return next();
			});

			composer.command("th", async (ctx) => {
				const chat = ctx.chat;
				if (!isGroupChat(chat)) return;

				const chatId = String(chat.id);
				const threadId = getThreadId(ctx);
				const reply = (text: string) => ctx.reply(text, { message_thread_id: threadId === "0" ? undefined : Number(threadId) }).catch(() => {});

				if (threadId === "0") {
					await reply("/th работает только внутри форум-темы (подчата), не в общем чате.");
					return;
				}

				const name = ctx.payload.trim();
				if (!name) {
					await reply("Укажите название: /th Games");
					return;
				}

				const result = await repos.topics.setName(chatId, threadId, name);
				if (!result) {
					await reply("Не нашёл эту тему — напишите сюда что-нибудь ещё и повторите.");
					return;
				}

				await reply(result.wasUnset ? `Тема зарегистрирована как "${name}".` : `Тема переименована в "${name}".`);
				logger.info("Topic named via /th", { chatId, threadId, name, wasUnset: result.wasUnset });
			});

			logger.info("core part ready");
			return composer;
		},
	};
}
