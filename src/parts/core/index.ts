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

			logger.info("core part ready");
			return composer;
		},
	};
}
