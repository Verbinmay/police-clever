import type { MessagesRepository } from "../../db/repositories/messages-repository.ts";
import type { AiConfig } from "./default-config.ts";

export interface ChatContext {
	/** "ник: текст" построчно, обрезано по contextCharBudget, в хронологическом порядке. */
	dialogText: string;
	/** Уникальные ники за последние activeParticipantsLookback сообщений, самые свежие первыми. */
	activeParticipants: string[];
	/** Ник → message_id его последнего сообщения в окне — чтобы шутку про {target} отправить реплаем именно на его сообщение. */
	lastMessageIdByName: Record<string, string>;
}

/** Пометка своих реплик в контексте — тот же текст объясняется модели в promptTemplate. */
export const OWN_LINE_MARK = "(это ты)";

/**
 * Вместо фиксированного "последние N сообщений" — тянем достаточно
 * сообщений, чтобы покрыть и окно активных участников, и бюджет символов,
 * а сам сырой диалог в промпт обрезаем по contextCharBudget (с конца, то
 * есть оставляем самое свежее). Это держит стоимость входа предсказуемой
 * независимо от того, сколько реально писали в чате — в отличие от
 * старого подхода "последние 4 сообщения", где объём context никак не был
 * привязан к его реальному размеру в символах.
 */
export async function buildChatContext(messages: MessagesRepository, chatId: string, threadId: string, config: AiConfig, botName?: string, botTgId?: string): Promise<ChatContext> {
	// По tg_id надёжнее, чем по нику: человек с тем же first_name, что у
	// бота, иначе считался бы "собой". Ник — запасной вариант, если getMe не
	// успел отработать.
	const isBotRow = (row: { tgId: string; fromName: string | null }) => (botTgId ? row.tgId === botTgId : Boolean(botName) && row.fromName === botName);
	// С запасом под contextCharBudget: короткие реплики ("ахах", "дэ") по
	// 10-20 символов, и при фиксированных 10-30 строках упирались в число
	// строк раньше, чем в бюджет символов.
	const fetchCount = Math.max(config.activeParticipantsLookback, 80);
	const rows = await messages.findLastNInThread(chatId, threadId, fetchCount);

	// botName исключаем из "активных участников" — это имя, под которым бот
	// сам сохраняет свои реплики (см. ai-fun/index.ts), не реальный человек.
	// Без исключения бот мог бы выбрать сам себя целью для targeted/sarcasm
	// шутки ({target} подставляется случайным активным участником, scenario.ts).
	const participantsWindow = rows.slice(-config.activeParticipantsLookback);
	const activeParticipants: string[] = [];
	const lastMessageIdByName: Record<string, string> = {};
	for (let i = participantsWindow.length - 1; i >= 0; i--) {
		const row = participantsWindow[i];
		const name = row?.fromName;
		if (!row || !name || isBotRow(row)) continue;
		if (!activeParticipants.includes(name)) activeParticipants.push(name);
		if (row.messageId && !(name in lastMessageIdByName)) lastMessageIdByName[name] = row.messageId;
	}

	const lines: string[] = [];
	let usedChars = 0;
	for (let i = rows.length - 1; i >= 0; i--) {
		const row = rows[i];
		if (!row) continue;
		// Свои реплики помечаем явно: раньше они шли в контекст наравне с
		// чужими, и бот подхватывал собственный тон как "тон чата" — грубость
		// раскачивалась по кругу (бот грубит → чат отвечает тем же → бот
		// видит это и грубит сильнее). С пометкой промпт просит не повторять
		// свои формулировки и не тянуть свой тон по инерции.
		const isOwn = isBotRow(row);
		const line = `${row.fromName ?? "аноним"}${isOwn ? ` ${OWN_LINE_MARK}` : ""}: ${row.text}`;
		if (usedChars + line.length > config.contextCharBudget && lines.length > 0) break;
		lines.unshift(line);
		usedChars += line.length;
	}

	return { dialogText: lines.join("\n"), activeParticipants, lastMessageIdByName };
}

/** Порт `createPromt` из старого `ai.service.ts`, теперь принимает уже выбранный текст сценария (см. scenario.ts). */
export function buildSystemPrompt(config: AiConfig, action: string): string {
	return config.promptTemplate.replace("{action}", action);
}

/** Собирает финальный текст, который уходит в поле "user" запроса — список активных + сырой хвост диалога. */
export function buildUserContent(context: ChatContext): string {
	const parts: string[] = [];
	if (context.activeParticipants.length > 0) parts.push(`Сейчас в чате пишут: ${context.activeParticipants.join(", ")}`);
	parts.push(context.dialogText || "(сообщений пока нет)");
	return parts.join("\n\n");
}
