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
	/**
	 * Учёт дней рождения (parts/birthdays) — единственный тумблер на весь
	 * ЧАТ целиком, не на отдельные форум-темы, в отличие от aiJokesEnabled/
	 * muteVoteEnabled/yesNoEnabled на Topic. Причина: у форумного чата может
	 * быть под два десятка тем — заставлять включать учёт в каждой отдельно
	 * было бы неюзабельно, а сам смысл фичи ("кто вообще есть в этом чате")
	 * естественно относится к чату целиком, а не к конкретной теме.
	 */
	birthdaysEnabled: boolean;
	registeredAt: Date;
}

export const ChatSchema = new EntitySchema<Chat>({
	name: "Chat",
	tableName: "chats",
	columns: {
		chatId: { type: "text", primary: true, name: "chat_id" },
		title: { type: "text", nullable: true },
		isForum: { type: "boolean", default: false, name: "is_forum" },
		birthdaysEnabled: { type: "boolean", default: false, name: "birthdays_enabled" },
		registeredAt: { type: "timestamptz", name: "registered_at", createDate: true },
	},
});
