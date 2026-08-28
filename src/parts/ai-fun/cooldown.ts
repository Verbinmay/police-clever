import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";

const PART_ID = "ai";

function cooldownKey(chatId: string, kind: string): string {
	return `cooldown:${kind}:${chatId}`;
}

/**
 * Персистентный (переживает рестарт процесса) кулдаун НА ВЕСЬ ЧАТ (не на
 * тему) — сознательно общий счётчик: это рычаг стоимости, а не "памяти"
 * бота (для памяти/атмосферы есть отдельная сводка на тему, см.
 * summary.ts). Если бы кулдаун был на тему, чат с 5 активными темами мог
 * бы генерить в 5 раз больше AI-ответов за то же время, чем чат с одной —
 * ровно то, чего кулдаун должен не допускать. Виды: "reply" — общий между
 * ЛЮБЫМИ AI-ответами (триггер-слово или гача); "sticker" — отдельный,
 * короткий, на стикер-заглушку (см. stickers.ts).
 */
export async function isOnCooldown(settings: SettingsRepository, chatId: string, cooldownMinutes: number, kind: "reply" | "sticker" = "reply"): Promise<boolean> {
	const last = await settings.get<number>(PART_ID, cooldownKey(chatId, kind), 0);
	const diffMinutes = (Date.now() - last) / 1000 / 60;
	return diffMinutes < cooldownMinutes;
}

export async function markCooldown(settings: SettingsRepository, chatId: string, kind: "reply" | "sticker" = "reply"): Promise<void> {
	await settings.set(PART_ID, cooldownKey(chatId, kind), Date.now());
}

/** Сколько минут осталось до конца кулдауна (0 — кулдауна сейчас нет) — для счётчика "блок на AI-ответы" в панели. */
export async function cooldownRemainingMinutes(settings: SettingsRepository, chatId: string, cooldownMinutes: number, kind: "reply" | "sticker" = "reply"): Promise<number> {
	const last = await settings.get<number>(PART_ID, cooldownKey(chatId, kind), 0);
	const remainingMs = cooldownMinutes * 60_000 - (Date.now() - last);
	return remainingMs > 0 ? Math.ceil(remainingMs / 60_000) : 0;
}
