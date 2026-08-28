import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import type { AiConfig } from "./default-config.ts";

const PART_ID = "ai";

function counterKey(chatId: string, threadId: string): string {
	return `gacha:${chatId}:${threadId}`;
}

function probabilityForCounter(curve: AiConfig["gachaCurve"], counter: number): number {
	const range = curve.find((r) => counter <= r.upToCounter);
	return (range ?? curve[curve.length - 1])?.probability ?? 0;
}

/**
 * Персистентная (на тему, переживает рестарт процесса) версия старой
 * in-memory гачи из `ai.handler.ts`. Счётчик на (chatId, threadId), а не
 * только на chatId — иначе две разные темы одного чата с включёнными
 * AI-шутками делили бы один счётчик, хотя это независимые разговоры.
 */
export async function rollGacha(settings: SettingsRepository, chatId: string, threadId: string, config: AiConfig): Promise<boolean> {
	const key = counterKey(chatId, threadId);
	const counter = await settings.get<number>(PART_ID, key, 1);

	if (counter >= config.gachaGuaranteedAt) {
		await settings.set(PART_ID, key, 1);
		return true;
	}

	const probability = probabilityForCounter(config.gachaCurve, counter);
	if (Math.random() < probability) {
		await settings.set(PART_ID, key, 1);
		return true;
	}

	await settings.set(PART_ID, key, counter + 1);
	return false;
}

/** Текущее значение счётчика гачи темы, без побочных эффектов — для отображения в панели (не крутит саму гачу). */
export async function peekGachaCounter(settings: SettingsRepository, chatId: string, threadId: string): Promise<number> {
	return settings.get<number>(PART_ID, counterKey(chatId, threadId), 1);
}

/** Ручная правка счётчика из панели — ускорить или отодвинуть гарантированный ответ, не дожидаясь реальных сообщений. Минимум 1 (0 и отрицательные не имеют смысла — счётчик всегда "с какого сообщения считаем"). */
export async function setGachaCounter(settings: SettingsRepository, chatId: string, threadId: string, value: number): Promise<void> {
	await settings.set(PART_ID, counterKey(chatId, threadId), Math.max(1, Math.floor(value)));
}
