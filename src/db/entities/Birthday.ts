import { EntitySchema } from "typeorm";

export type Gender = "male" | "female" | null;
/**
 * null — ещё ничего не задано (ни автоскан, ни админ). "auto" — нашла AI по
 * сообщениям, автоскан вправе перезаписать при следующем проходе. "admin" —
 * задал человек в панели, автоскан эту запись больше не трогает никогда
 * (см. upsertAuto в birthdays-repository.ts).
 */
export type BirthdaySource = "auto" | "admin" | null;

/**
 * Один человек (не пара чат+человек) — имя/юзернейм/пол/др у человека одни
 * и те же независимо от того, в скольких темах чата он пишет. chatId —
 * какой чат считать "своим" для этого человека (куда слать поздравление),
 * обновляется на последний чат, где его видели активным. threadId — просто
 * справочная информация о последней активности (какая тема), поздравление
 * по прямому требованию всегда уходит в ОБЩИЙ чат (threadId="0"), не в
 * конкретную форум-тему — см. congratulate.ts. tgId — глобальный Telegram
 * id, этого достаточно как ключ.
 */
export interface Birthday {
	tgId: string;
	firstName: string;
	username: string | null;
	gender: Gender;
	/** Кто задал пол — та же защита от перезаписи автосканом, что и у birthday/source (см. upsertAuto в birthdays-repository.ts). */
	genderSource: BirthdaySource;
	/** "ДД.ММ", без года — года не всегда known/нужен для поздравления. null — не найдено. */
	birthday: string | null;
	source: BirthdaySource;
	/** Чат, куда уйдёт поздравление (общий чат, не конкретная тема) — последний чат, где человека видели активным. */
	chatId: string;
	/** Справочно — последняя тема активности, для отправки поздравления НЕ используется (см. congratulate.ts). */
	threadId: string;
	updatedAt: Date;
}

export const BirthdaySchema = new EntitySchema<Birthday>({
	name: "Birthday",
	tableName: "birthdays",
	columns: {
		tgId: { type: "text", primary: true, name: "tg_id" },
		firstName: { type: "text", name: "first_name" },
		username: { type: "text", nullable: true },
		gender: { type: "text", nullable: true },
		genderSource: { type: "text", nullable: true, name: "gender_source" },
		birthday: { type: "text", nullable: true },
		source: { type: "text", nullable: true },
		chatId: { type: "text", name: "chat_id" },
		threadId: { type: "text", name: "thread_id" },
		updatedAt: { type: "timestamptz", name: "updated_at", updateDate: true },
	},
	indices: [{ columns: ["birthday"] }],
});
