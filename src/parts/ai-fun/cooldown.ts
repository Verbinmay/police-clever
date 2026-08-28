import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";

const PART_ID = "ai";

function cooldownKey(chatId: string, kind: string): string {
	return `cooldown:${kind}:${chatId}`;
}

/**
 * Персистентный (переживает рестарт процесса) кулдаун на чат, по видам:
 * "reply" — общий между ЛЮБЫМИ AI-ответами (триггер-слово или гача);
 * "sticker" — отдельный, короткий, на стикер-заглушку (см. stickers.ts),
 * чтобы спам триггер-словом не превращался в спам стикерами вместо
 * AI-вызовов, когда основной лимит уже исчерпан.
 */
export async function isOnCooldown(settings: SettingsRepository, chatId: string, cooldownMinutes: number, kind: "reply" | "sticker" = "reply"): Promise<boolean> {
	const last = await settings.get<number>(PART_ID, cooldownKey(chatId, kind), 0);
	const diffMinutes = (Date.now() - last) / 1000 / 60;
	return diffMinutes < cooldownMinutes;
}

export async function markCooldown(settings: SettingsRepository, chatId: string, kind: "reply" | "sticker" = "reply"): Promise<void> {
	await settings.set(PART_ID, cooldownKey(chatId, kind), Date.now());
}
