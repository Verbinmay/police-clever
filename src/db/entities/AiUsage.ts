import { EntitySchema } from "typeorm";

export type AiUsageKind = "trigger" | "gacha";

/**
 * Один вызов AI (шутка по триггер-слову или пассивная гача) — под
 * статистику в панели: звонков/токенов/$ в день, по чатам. `provider` и
 * `costUsd` фиксируются на момент вызова (не пересчитываются задним
 * числом по текущим ценам) — так исторический отчёт не "уплывает" при
 * смене провайдера или правке цен в конфиге.
 */
export interface AiUsage {
	id: string;
	chatId: string;
	kind: AiUsageKind;
	provider: string;
	promptTokens: number;
	completionTokens: number;
	/** Оценочная стоимость вызова в $ по ценам провайдера на момент вызова. */
	costUsd: number;
	createdAt: Date;
}

export const AiUsageSchema = new EntitySchema<AiUsage>({
	name: "AiUsage",
	tableName: "ai_usage",
	columns: {
		id: { type: "uuid", primary: true, generated: "uuid" },
		chatId: { type: "text", name: "chat_id" },
		kind: { type: "text" },
		provider: { type: "text", default: "deepseek" },
		promptTokens: { type: "int", default: 0, name: "prompt_tokens" },
		completionTokens: { type: "int", default: 0, name: "completion_tokens" },
		costUsd: { type: "double precision", default: 0, name: "cost_usd" },
		createdAt: { type: "timestamptz", name: "created_at", createDate: true },
	},
	indices: [{ columns: ["chatId", "createdAt"] }],
});
