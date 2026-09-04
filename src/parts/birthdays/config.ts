import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import { DEFAULT_BIRTHDAYS_CONFIG, type BirthdaysConfig } from "./default-config.ts";

const PART_ID = "birthdays";
const CONFIG_KEY = "config";

/** Читает BirthdaysConfig из панели; при первом запуске сидирует дефолт из default-config.ts. Тот же паттерн, что ai-fun/config.ts. */
export async function loadBirthdaysConfig(settings: SettingsRepository): Promise<BirthdaysConfig> {
	const existing = await settings.get<BirthdaysConfig | null>(PART_ID, CONFIG_KEY, null);
	if (existing) return existing;
	await settings.set(PART_ID, CONFIG_KEY, DEFAULT_BIRTHDAYS_CONFIG);
	return DEFAULT_BIRTHDAYS_CONFIG;
}

export async function saveBirthdaysConfig(settings: SettingsRepository, config: BirthdaysConfig): Promise<void> {
	await settings.set(PART_ID, CONFIG_KEY, config);
}
