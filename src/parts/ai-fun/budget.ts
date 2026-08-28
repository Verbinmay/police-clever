import type { AiUsageRepository } from "../../db/repositories/ai-usage-repository.ts";
import type { ProviderModelConfig } from "./providers.ts";

/** Оценочная стоимость одного вызова в $, по ценам активного провайдера на момент вызова. */
export function estimateCostUsd(promptTokens: number, completionTokens: number, provider: ProviderModelConfig): number {
	return (promptTokens / 1_000_000) * provider.inputPricePerMTok + (completionTokens / 1_000_000) * provider.outputPricePerMTok;
}

/**
 * Глобальный (на весь бот, не на чат) месячный $ потолок — самая прямая
 * страховка от "неожиданного счёта": дневной кап на чат (см. index.ts)
 * ограничивает частоту, а это ограничивает именно доллары, суммарно по
 * всем чатам сразу, независимо от того, сколько чатов подключено.
 */
export async function isOverMonthlyBudget(aiUsage: AiUsageRepository, monthlyBudgetUsd: number): Promise<boolean> {
	if (monthlyBudgetUsd <= 0) return false; // 0 или отрицательное — бюджет не ограничен
	const spent = await aiUsage.monthToDateCostUsd();
	return spent >= monthlyBudgetUsd;
}
