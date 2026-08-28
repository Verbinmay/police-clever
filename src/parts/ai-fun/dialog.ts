import type { MessagesRepository } from "../../db/repositories/messages-repository.ts";
import type { AiConfig } from "./default-config.ts";

export interface ChatContext {
	/** "ник: текст" построчно, обрезано по contextCharBudget, в хронологическом порядке. */
	dialogText: string;
	/** Уникальные ники за последние activeParticipantsLookback сообщений, самые свежие первыми. */
	activeParticipants: string[];
}

/**
 * Вместо фиксированного "последние N сообщений" — тянем достаточно
 * сообщений, чтобы покрыть и окно активных участников, и бюджет символов,
 * а сам сырой диалог в промпт обрезаем по contextCharBudget (с конца, то
 * есть оставляем самое свежее). Это держит стоимость входа предсказуемой
 * независимо от того, сколько реально писали в чате — в отличие от
 * старого подхода "последние 4 сообщения", где объём context никак не был
 * привязан к его реальному размеру в символах.
 */
export async function buildChatContext(messages: MessagesRepository, chatId: string, threadId: string, config: AiConfig): Promise<ChatContext> {
	const fetchCount = Math.max(config.activeParticipantsLookback, 10);
	const rows = await messages.findLastNInThread(chatId, threadId, fetchCount);

	const participantsWindow = rows.slice(-config.activeParticipantsLookback);
	const activeParticipants: string[] = [];
	for (let i = participantsWindow.length - 1; i >= 0; i--) {
		const name = participantsWindow[i]?.fromName;
		if (name && !activeParticipants.includes(name)) activeParticipants.push(name);
	}

	const lines: string[] = [];
	let usedChars = 0;
	for (let i = rows.length - 1; i >= 0; i--) {
		const row = rows[i];
		if (!row) continue;
		const line = `${row.fromName ?? "аноним"}: ${row.text}`;
		if (usedChars + line.length > config.contextCharBudget && lines.length > 0) break;
		lines.unshift(line);
		usedChars += line.length;
	}

	return { dialogText: lines.join("\n"), activeParticipants };
}

/** Порт `createPromt` из старого `ai.service.ts`, теперь принимает уже выбранный текст сценария (см. tone.ts). */
export function buildSystemPrompt(config: AiConfig, action: string): string {
	return config.promptTemplate.replace("{action}", action);
}

/** Собирает финальный текст, который уходит в поле "user" запроса — саммари (если есть) + список активных + сырой хвост диалога. */
export function buildUserContent(context: ChatContext, summary: string | null): string {
	const parts: string[] = [];
	if (summary) parts.push(`Сводка недавней беседы: ${summary}`);
	if (context.activeParticipants.length > 0) parts.push(`Сейчас в чате пишут: ${context.activeParticipants.join(", ")}`);
	parts.push(context.dialogText || "(сообщений пока нет)");
	return parts.join("\n\n");
}
