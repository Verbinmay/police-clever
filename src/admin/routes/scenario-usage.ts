import { Router } from "express";
import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import { loadAiConfig } from "../../parts/ai-fun/config.ts";
import { usageKey } from "../../parts/ai-fun/scenario.ts";

const PART_ID = "ai";

/**
 * Сколько раз каждый сценарий реально был выбран (scenario.ts, shuffle-bag
 * по минимальному счётчику во всём общем пуле — тонов/категорий больше
 * нет, один список) — для контроля, что распределение действительно
 * равномерное, а не только "по задумке". Список сценариев берётся из
 * текущего конфига (актуальные формулировки), счётчик — 0, если ни разу
 * ещё не выпал.
 */
export function createScenarioUsageRouter(settings: SettingsRepository): Router {
	const router = Router();

	router.get("/", async (_req, res) => {
		const config = await loadAiConfig(settings);
		const usage = await settings.get<Record<string, number>>(PART_ID, usageKey(), {});

		const result = config.actions.map((scenario) => ({ scenario, count: usage[scenario] ?? 0 })).sort((a, b) => b.count - a.count);

		res.json(result);
	});

	return router;
}
