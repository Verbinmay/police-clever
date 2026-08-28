/**
 * Каталог поддерживаемых AI-провайдеров. Оба — DeepSeek и OpenAI — говорят
 * по одному и тому же протоколу (`openai` SDK, chat.completions), поэтому
 * переключение — это смена baseURL/модели/ключа, а не другого клиента (см.
 * ai-client.ts). Активный провайдер — AiConfig.provider (PartSetting,
 * редактируется в панели без передеплоя); ключи берутся из env
 * (DEEPSEEK_API_KEY/OPENAI_API_KEY, оба опциональны — заполнен должен быть
 * хотя бы тот, что реально выбран активным).
 *
 * Цены — оценочные (для расчёта примерной стоимости в статистике панели),
 * не тарификация провайдера "по факту" — при изменении официальных цен
 * поправьте здесь или прямо в панели (providers.<id>.inputPricePerMTok/
 * outputPricePerMTok), это не влияет на сами API-вызовы.
 */
export type ProviderId = "deepseek" | "openai";

export interface ProviderModelConfig {
	label: string;
	baseUrl: string;
	model: string;
	/** $ за 1M входных токенов — для оценки стоимости, см. budget.ts. */
	inputPricePerMTok: number;
	/** $ за 1M выходных токенов. */
	outputPricePerMTok: number;
}

export const DEFAULT_PROVIDERS: Record<ProviderId, ProviderModelConfig> = {
	deepseek: {
		label: "DeepSeek",
		baseUrl: "https://api.deepseek.com",
		// deepseek-chat — легаси-алиас, DeepSeek отключил его 24 июля 2026.
		model: "deepseek-v4-flash",
		// Off-peak, cache-miss — см. память ai-provider-cost-comparison.
		inputPricePerMTok: 0.22,
		outputPricePerMTok: 0.66,
	},
	openai: {
		label: "OpenAI",
		baseUrl: "https://api.openai.com/v1",
		model: "gpt-5-mini",
		inputPricePerMTok: 0.25,
		outputPricePerMTok: 2.0,
	},
};

export function apiKeyEnvVar(provider: ProviderId): "DEEPSEEK_API_KEY" | "OPENAI_API_KEY" {
	return provider === "deepseek" ? "DEEPSEEK_API_KEY" : "OPENAI_API_KEY";
}
