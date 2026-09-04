import { Router } from "express";
import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import { loadAiConfig } from "../../parts/ai-fun/config.ts";
import type { Tone } from "../../parts/ai-fun/default-config.ts";
import { usageKey } from "../../parts/ai-fun/tone.ts";

const PART_ID = "ai";
const TONES: Tone[] = ["general", "targeted", "sarcasm", "praise"];

/**
 * Сколько раз каждый сценарий реально был выбран (tone.ts, shuffle-bag
 * по минимальному счётчику) — для контроля, что распределение внутри
 * каждого тона действительно равномерное, а не только "по задумке".
 * Список сценариев берётся из текущего конфига (актуальные формулировки),
 * счётчик — 0, если ни разу ещё не выпал.
 */
export function createScenarioUsageRouter(settings: SettingsRepository): Router {
	const router = Router();

	router.get("/", async (_req, res) => {
		const config = await loadAiConfig(settings);
		const result: Record<Tone, Array<{ scenario: string; count: number }>> = { general: [], targeted: [], sarcasm: [], praise: [] };

		for (const tone of TONES) {
			const usage = await settings.get<Record<string, number>>(PART_ID, usageKey(tone), {});
			result[tone] = config.actionsByTone[tone]
				.map((scenario) => ({ scenario, count: usage[scenario] ?? 0 }))
				.sort((a, b) => b.count - a.count);
		}

		res.json(result);
	});

	return router;
}
