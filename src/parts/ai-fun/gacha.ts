import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import type { AiConfig } from "./default-config.ts";

const PART_ID = "ai";

function counterKey(chatId: string): string {
	return `gacha:${chatId}`;
}

function probabilityForCounter(curve: AiConfig["gachaCurve"], counter: number): number {
	const range = curve.find((r) => counter <= r.upToCounter);
	return (range ?? curve[curve.length - 1])?.probability ?? 0;
}

/**
 * Персистентная (на чат, переживает рестарт процесса) версия старой
 * in-memory гачи из `ai.handler.ts` — это чинит баг, который сам
 * пользователь отмечал (общий на все чаты счётчик в памяти).
 */
export async function rollGacha(settings: SettingsRepository, chatId: string, config: AiConfig): Promise<boolean> {
	const counter = await settings.get<number>(PART_ID, counterKey(chatId), 1);

	if (counter >= config.gachaGuaranteedAt) {
		await settings.set(PART_ID, counterKey(chatId), 1);
		return true;
	}

	const probability = probabilityForCounter(config.gachaCurve, counter);
	if (Math.random() < probability) {
		await settings.set(PART_ID, counterKey(chatId), 1);
		return true;
	}

	await settings.set(PART_ID, counterKey(chatId), counter + 1);
	return false;
}
