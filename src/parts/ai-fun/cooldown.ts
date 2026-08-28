import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";

const PART_ID = "ai";

function cooldownKey(chatId: string): string {
	return `cooldown:${chatId}`;
}

/**
 * Общий кулдаун между ЛЮБЫМИ AI-ответами в чате (триггер-слово или гача) —
 * персистентный (переживает рестарт процесса, в отличие от старого
 * in-memory лимита, который был только у триггер-слова и не покрывал
 * гачу вовсе). Прямая защита от того, что активный чат просто из-за
 * объёма сообщений накручивает AI-вызовы чаще, чем хочется платить.
 */
export async function isOnCooldown(settings: SettingsRepository, chatId: string, cooldownMinutes: number): Promise<boolean> {
	const last = await settings.get<number>(PART_ID, cooldownKey(chatId), 0);
	const diffMinutes = (Date.now() - last) / 1000 / 60;
	return diffMinutes < cooldownMinutes;
}

export async function markCooldown(settings: SettingsRepository, chatId: string): Promise<void> {
	await settings.set(PART_ID, cooldownKey(chatId), Date.now());
}
