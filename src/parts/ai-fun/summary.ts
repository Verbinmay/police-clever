import type { MessagesRepository } from "../../db/repositories/messages-repository.ts";
import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import type { Logger } from "../../logger/logger.ts";
import type { AiClient } from "./ai-client.ts";
import type { AiConfig } from "./default-config.ts";

const PART_ID = "ai";

function summaryKey(chatId: string): string {
	return `summary:${chatId}`;
}
function counterKey(chatId: string): string {
	return `summaryCounter:${chatId}`;
}

const SUMMARY_PROMPT =
	"Сожми переписку в одну краткую сводку атмосферы разговора (не пересказ по пунктам): кто активен, какая тема, кто на кого шутит/огрызается, чей юмор заходит. Только сама сводка, 2-4 предложения, без вступлений.";

/** Текущая сохранённая сводка чата (null, если ещё ни разу не собиралась). */
export async function getSummary(settings: SettingsRepository, chatId: string): Promise<string | null> {
	return settings.get<string | null>(PART_ID, summaryKey(chatId), null);
}

/**
 * Раз в config.summary.everyNMessages сообщений темы — дешёвым отдельным
 * вызовом (свой, урезанный maxTokens) пересобирает "сводку атмосферы"
 * последнего окна сообщений и сохраняет её в PartSetting. Это даёт AI-
 * шуткам ощущение "памяти" о чате почти бесплатно даже при кратном росте
 * активности — каждая отдельная шутка использует уже готовую короткую
 * сводку вместо того, чтобы каждый раз заново вчитываться в длинную
 * историю.
 *
 * Вызывается на каждое сообщение темы с включённым aiJokesEnabled — сам
 * решает, пора ли обновляться, по счётчику. Не блокирует основной путь
 * шутки: ошибка тут не должна ронять обработку сообщения.
 */
export async function maybeUpdateSummary(
	aiClient: AiClient,
	messagesRepo: MessagesRepository,
	settings: SettingsRepository,
	chatId: string,
	threadId: string,
	config: AiConfig,
	logger: Logger,
): Promise<void> {
	try {
		const counter = await settings.get<number>(PART_ID, counterKey(chatId), 0);
		const next = counter + 1;

		if (next < config.summary.everyNMessages) {
			await settings.set(PART_ID, counterKey(chatId), next);
			return;
		}

		const rows = await messagesRepo.findLastNInThread(chatId, threadId, config.summary.lookbackMessages);
		const dialogText = rows.map((m) => `${m.fromName ?? "аноним"}: ${m.text}`).join("\n");
		if (!dialogText) {
			await settings.set(PART_ID, counterKey(chatId), 0);
			return;
		}

		const reply = await aiClient.getReply(SUMMARY_PROMPT, dialogText, logger, config.summary.maxTokens);
		await settings.set(PART_ID, counterKey(chatId), 0);
		if (!reply) {
			logger.warn("Summary refresh produced no reply", { chatId, threadId });
			return;
		}

		const text = reply.text.length > config.summary.maxChars ? `${reply.text.slice(0, config.summary.maxChars)}…` : reply.text;
		await settings.set(PART_ID, summaryKey(chatId), text);
		logger.info("Summary refreshed", { chatId, threadId, chars: text.length });
	} catch (err) {
		logger.error("Failed to refresh summary", { chatId, threadId }, err);
	}
}
