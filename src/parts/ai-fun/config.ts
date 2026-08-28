import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import { DEFAULT_AI_CONFIG, type AiConfig } from "./default-config.ts";

const PART_ID = "ai";
const CONFIG_KEY = "config";

/** Читает AiConfig из панели; при первом запуске сидирует дефолты из default-config.ts. */
export async function loadAiConfig(settings: SettingsRepository): Promise<AiConfig> {
	const existing = await settings.get<AiConfig | null>(PART_ID, CONFIG_KEY, null);
	if (existing) return existing;
	await settings.set(PART_ID, CONFIG_KEY, DEFAULT_AI_CONFIG);
	return DEFAULT_AI_CONFIG;
}

export async function saveAiConfig(settings: SettingsRepository, config: AiConfig): Promise<void> {
	await settings.set(PART_ID, CONFIG_KEY, config);
}
