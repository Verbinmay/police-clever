import { EntitySchema } from "typeorm";

/**
 * Локальный лог текстовых сообщений — источник контекста для AI-шуток
 * (последние N сообщений темы) и только он (историю Bot API задним числом
 * не отдаёт). Имя отправителя денормализовано прямо сюда (fromName), чтобы
 * не заводить отдельную таблицу профилей — она была нужна старому
 * police-clever под /addBio /addBirthday /getInfo, которых в этой версии
 * нет.
 *
 * Чистится почасовым кроном (см. src/parts/core/cleanup.ts), иначе растёт
 * бесконечно.
 */
export interface Message {
	id: string;
	chatId: string;
	threadId: string;
	tgId: string;
	fromName: string | null;
	text: string;
	createdAt: Date;
}

export const MessageSchema = new EntitySchema<Message>({
	name: "Message",
	tableName: "messages",
	columns: {
		id: { type: "uuid", primary: true, generated: "uuid" },
		chatId: { type: "text", name: "chat_id" },
		threadId: { type: "text", name: "thread_id" },
		tgId: { type: "text", name: "tg_id" },
		fromName: { type: "text", nullable: true, name: "from_name" },
		text: { type: "text" },
		createdAt: { type: "timestamptz", name: "created_at", createDate: true },
	},
	indices: [{ columns: ["chatId", "threadId", "createdAt"] }],
});
