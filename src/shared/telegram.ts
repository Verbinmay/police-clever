import type { Context } from "telegraf";

/** message_thread_id, если сообщение внутри форум-темы; "0" — общий "подчат" нефорумного чата. */
export function getThreadId(ctx: Context): string {
	const message = ctx.message ?? ctx.channelPost ?? ctx.callbackQuery?.message;
	const threadId = message && "message_thread_id" in message ? message.message_thread_id : undefined;
	return String(threadId ?? 0);
}

/** Имя темы приходит только служебным сообщением при создании/переименовании — Bot API не даёт получить его иначе. */
export function getTopicName(ctx: Context): string | undefined {
	const message = ctx.message;
	if (message && "forum_topic_created" in message) return message.forum_topic_created.name;
	if (message && "forum_topic_edited" in message) return message.forum_topic_edited.name;
	return undefined;
}

export function isGroupChat(chat: Context["chat"]): chat is NonNullable<Context["chat"]> & { type: "group" | "supergroup" } {
	return chat?.type === "group" || chat?.type === "supergroup";
}

export function displayName(from: { first_name?: string; username?: string } | undefined): string | null {
	if (!from) return null;
	return from.first_name ?? (from.username ? `@${from.username}` : null);
}
