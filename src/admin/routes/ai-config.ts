import { Router } from "express";
import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import { loadAiConfig, saveAiConfig } from "../../parts/ai-fun/config.ts";
import type { AiConfig } from "../../parts/ai-fun/default-config.ts";

/** Промпт/список шуток/триггер-слово/гача-кривая — "конфиги фраз", редактируются без передеплоя. */
export function createAiConfigRouter(settings: SettingsRepository): Router {
	const router = Router();

	router.get("/", async (_req, res) => {
		res.json(await loadAiConfig(settings));
	});

	router.put("/", async (req, res) => {
		const patch = req.body as Partial<AiConfig>;
		const current = await loadAiConfig(settings);
		const next: AiConfig = { ...current, ...patch };
		await saveAiConfig(settings, next);
		res.json(next);
	});

	return router;
}
