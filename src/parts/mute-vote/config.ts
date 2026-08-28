import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import { DEFAULT_MUTE_VOTE_CONFIG, type MuteVoteConfig } from "./default-config.ts";

const PART_ID = "mutevote";
const CONFIG_KEY = "config";

export async function loadMuteVoteConfig(settings: SettingsRepository): Promise<MuteVoteConfig> {
	const existing = await settings.get<MuteVoteConfig | null>(PART_ID, CONFIG_KEY, null);
	if (existing) return existing;
	await settings.set(PART_ID, CONFIG_KEY, DEFAULT_MUTE_VOTE_CONFIG);
	return DEFAULT_MUTE_VOTE_CONFIG;
}

export async function saveMuteVoteConfig(settings: SettingsRepository, config: MuteVoteConfig): Promise<void> {
	await settings.set(PART_ID, CONFIG_KEY, config);
}
