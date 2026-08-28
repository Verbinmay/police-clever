import { EntitySchema } from "typeorm";

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Единая лента логов бота — то, что показывает админ-панель ("логирование
 * всего"). partId="system" — для записей до/вне контекста конкретной части
 * (подключение к БД, вебхук и т.п.). Порт 1:1 из bots-platform
 * (`db/entities/PartLog.ts`).
 */
export interface PartLog {
	id: number;
	partId: string;
	level: LogLevel;
	module: string;
	message: string;
	context: Record<string, unknown> | null;
	createdAt: Date;
}

export const PartLogSchema = new EntitySchema<PartLog>({
	name: "PartLog",
	tableName: "part_logs",
	columns: {
		id: { type: "int", primary: true, generated: true },
		partId: { type: "text", name: "part_id" },
		level: { type: "text" },
		module: { type: "text" },
		message: { type: "text" },
		context: { type: "jsonb", nullable: true },
		createdAt: { type: "timestamptz", name: "created_at", createDate: true },
	},
	indices: [{ columns: ["partId", "createdAt"] }],
});
