import { Router } from "express";
import type { AiUsageRepository } from "../../db/repositories/ai-usage-repository.ts";
import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import { loadAiConfig } from "../../parts/ai-fun/config.ts";

/** Статистика AI + бюджет: сколько потрачено сегодня/в этом месяце, остаток от месячного лимита, активный провайдер. */
export function createAiStatsRouter(aiUsage: AiUsageRepository, settings: SettingsRepository): Router {
	const router = Router();

	router.get("/", async (req, res) => {
		const days = req.query.days ? Number(req.query.days) : 30;
		const [daily, byChat, todayCostUsd, monthToDateCostUsd, config] = await Promise.all([
			aiUsage.dailyTotals(days),
			aiUsage.totalsByChat(days),
			aiUsage.todayCostUsd(),
			aiUsage.monthToDateCostUsd(),
			loadAiConfig(settings),
		]);

		const monthlyBudgetUsd = config.monthlyBudgetUsd;
		res.json({
			daily,
			byChat,
			budget: {
				provider: config.provider,
				todayCostUsd,
				monthToDateCostUsd,
				monthlyBudgetUsd,
				remainingUsd: monthlyBudgetUsd > 0 ? Math.max(0, monthlyBudgetUsd - monthToDateCostUsd) : null,
				overBudget: monthlyBudgetUsd > 0 && monthToDateCostUsd >= monthlyBudgetUsd,
			},
		});
	});

	return router;
}
