import { EntitySchema } from "typeorm";

/**
 * Карточка Telegram-пользователя, которого бот когда-либо видел — только
 * для видимости в панели ("кого бот видел"), без профильных полей
 * (bio/birthday) — их в этой версии бота нет. Копия паттерна из
 * bots-platform (`db/entities/BotUser.ts`), без изменений по смыслу.
 */
export interface BotUser {
	tgId: string;
	username: string | null;
	firstName: string | null;
	firstSeenAt: Date;
	lastSeenAt: Date;
}

export const BotUserSchema = new EntitySchema<BotUser>({
	name: "BotUser",
	tableName: "bot_users",
	columns: {
		tgId: { type: "text", primary: true, name: "tg_id" },
		username: { type: "text", nullable: true },
		firstName: { type: "text", nullable: true, name: "first_name" },
		firstSeenAt: { type: "timestamptz", name: "first_seen_at", createDate: true },
		lastSeenAt: { type: "timestamptz", name: "last_seen_at", updateDate: true },
	},
});
