import OpenAI from "openai";
import { setTimeout as sleep } from "node:timers/promises";
import type { Logger } from "../../logger/logger.ts";
import type { ProviderModelConfig } from "./providers.ts";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;
const DEFAULT_MAX_TOKENS = 1000;

export interface AiReply {
	text: string;
	promptTokens: number;
	completionTokens: number;
}

/**
 * Клиент AI-провайдера — DeepSeek и OpenAI оба говорят по протоколу
 * chat.completions (`openai` SDK), поэтому один и тот же клиент работает
 * для обоих, разница только в baseURL/apiKey/модели (см. providers.ts).
 * Порт `ai.repository.ts` из старого police-clever — та же ретрай-логика.
 */
export function createAiClient(provider: ProviderModelConfig, apiKey: string) {
	const openai = new OpenAI({ baseURL: provider.baseUrl, apiKey, maxRetries: 4 });

	return {
		async getReply(systemPrompt: string, dialogText: string, logger: Logger, maxTokens: number = DEFAULT_MAX_TOKENS): Promise<AiReply | null> {
			for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
				try {
					const response = await openai.chat.completions.create({
						model: provider.model,
						messages: [
							{ role: "system", content: systemPrompt },
							{ role: "user", content: dialogText },
						],
						temperature: 0.9,
						max_tokens: maxTokens,
					});
					const text = response.choices[0]?.message?.content;
					if (!text) return null;
					return {
						text: text.replace(/"/g, ""),
						promptTokens: response.usage?.prompt_tokens ?? 0,
						completionTokens: response.usage?.completion_tokens ?? 0,
					};
				} catch (err) {
					if (attempt === MAX_RETRIES) {
						logger.error("AI request failed after retries", { attempt, provider: provider.label, model: provider.model }, err);
						return null;
					}
					logger.warn("AI request failed, retrying", { attempt, provider: provider.label, model: provider.model }, err);
					await sleep(RETRY_DELAY_MS * attempt);
				}
			}
			return null;
		},
	};
}

export type AiClient = ReturnType<typeof createAiClient>;
