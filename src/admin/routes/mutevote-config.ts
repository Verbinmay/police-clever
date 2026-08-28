import { Router } from "express";
import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import { loadMuteVoteConfig, saveMuteVoteConfig } from "../../parts/mute-vote/config.ts";
import type { MuteVoteConfig } from "../../parts/mute-vote/default-config.ts";

/** Спецфраза/кворум/окно/длительность мьюта — редактируются без передеплоя. */
export function createMuteVoteConfigRouter(settings: SettingsRepository): Router {
	const router = Router();

	router.get("/", async (_req, res) => {
		res.json(await loadMuteVoteConfig(settings));
	});

	router.put("/", async (req, res) => {
		const patch = req.body as Partial<MuteVoteConfig>;
		const current = await loadMuteVoteConfig(settings);
		const next: MuteVoteConfig = { ...current, ...patch };
		await saveMuteVoteConfig(settings, next);
		res.json(next);
	});

	return router;
}
