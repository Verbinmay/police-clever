import { EntitySchema } from "typeorm";

// "birthday-scan" был раньше (AI гадал пол/дату по bio) — скан теперь без
// AI вообще (дата — из структурированного профиля Telegram, пол только
// вручную, см. parts/birthdays/scan.ts), значение больше нигде не пишется,
// оставлено только "birthday-congrats" (AI-текст поздравления).
export type AiUsageKind = "trigger" | "gacha" | "birthday-congrats";

/**
 * Один вызов AI (шутка по триггер-слову или пассивная гача) — под
 * статистику в панели (звонков/токенов/$ в день, по чатам) И под "лог
 * ответов" (промпт + отправленный контекст + сам ответ), чтобы следить за
 * тем, что реально генерит бот, прямо из админки. `provider` и `costUsd`
 * фиксируются на момент вызова (не пересчитываются задним числом по
 * текущим ценам) — так исторический отчёт не "уплывает" при смене
 * провайдера или правке цен в конфиге.
 */
export interface AiUsage {
	id: string;
	chatId: string;
	threadId: string;
	kind: AiUsageKind;
	provider: string;
	/** Системный промпт, реально отправленный модели (шаблон + сценарий/явный текст триггера). */
	promptText: string;
	/** "user"-сообщение — активные участники + сырой хвост диалога (см. dialog.ts). */
	userContent: string;
	/** Итоговый текст, отправленный в чат. */
	replyText: string;
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
		threadId: { type: "text", default: "0", name: "thread_id" },
		kind: { type: "text" },
		provider: { type: "text", default: "deepseek" },
		promptText: { type: "text", default: "", name: "prompt_text" },
		userContent: { type: "text", default: "", name: "user_content" },
		replyText: { type: "text", default: "", name: "reply_text" },
		promptTokens: { type: "int", default: 0, name: "prompt_tokens" },
		completionTokens: { type: "int", default: 0, name: "completion_tokens" },
		costUsd: { type: "double precision", default: 0, name: "cost_usd" },
		createdAt: { type: "timestamptz", name: "created_at", createDate: true },
	},
	indices: [{ columns: ["chatId", "createdAt"] }],
});
