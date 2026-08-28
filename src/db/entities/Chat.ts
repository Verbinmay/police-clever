import { EntitySchema } from "typeorm";

/**
 * Зарегистрированный Telegram-чат. Чисто информационная карточка для
 * панели — никакой rights-логики (owner/admin в чате) здесь больше нет,
 * она была нужна только под старый moderation-командный интерфейс,
 * которого в этой версии бота нет вообще (см. план: управление — только
 * через админку).
 */
export interface Chat {
	chatId: string;
	title: string | null;
	isForum: boolean;
	registeredAt: Date;
}

export const ChatSchema = new EntitySchema<Chat>({
	name: "Chat",
	tableName: "chats",
	columns: {
		chatId: { type: "text", primary: true, name: "chat_id" },
		title: { type: "text", nullable: true },
		isForum: { type: "boolean", default: false, name: "is_forum" },
		registeredAt: { type: "timestamptz", name: "registered_at", createDate: true },
	},
});
