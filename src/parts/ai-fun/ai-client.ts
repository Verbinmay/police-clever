import OpenAI from "openai";
import { setTimeout as sleep } from "node:timers/promises";
import type { Logger } from "../../logger/logger.ts";
import type { ProviderId, ProviderModelConfig } from "./providers.ts";

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
 *
 * DeepSeek: у deepseek-v4-flash thinking-режим включён по умолчанию
 * (effort "high", см. api-docs.deepseek.com/guides/thinking_mode) —
 * рассуждения уходят в отдельное поле reasoning_content ДО content. При
 * небольшом max_tokens (шутка — короткий ответ, бюджет специально мал)
 * модель может потратить его весь на рассуждения и вернуть пустой
 * content без единой ошибки — молчаливый отказ, что и произошло на
 * практике (лог "AI request produced no reply" без каких-либо деталей).
 * Для этого бота рассуждение не нужно вообще (короткая реплика в духе
 * персонажа) — отключаем его явно параметром thinking.type="disabled"
 * (формат, который DeepSeek поддерживает поверх OpenAI-совместимого
 * протокола; для остальных провайдеров поле не отправляется).
 *
 * OpenAI: та же болезнь у gpt-5-mini — по умолчанию reasoning-модель,
 * при maxTokens=130 весь бюджет уходит в reasoning_tokens, content
 * приходит пустым (finish_reason: "length"), проверено вживую. Лечится
 * тем же способом — reasoning_effort: "minimal" (0 reasoning-токенов,
 * реальный content, finish_reason: "stop").
 */
export function createAiClient(provider: ProviderModelConfig, apiKey: string, providerId: ProviderId) {
	const openai = new OpenAI({ baseURL: provider.baseUrl, apiKey, maxRetries: 4 });

	return {
		/**
		 * stripQuotes=true (по умолчанию) — вырезает все двойные кавычки из
		 * ответа, чтобы шутка не оборачивалась в кавычки как цитата. Для
		 * структурированных JSON-ответов (см. parts/birthdays/scan.ts) это
		 * ломает парсинг — там передаём false.
		 */
		async getReply(systemPrompt: string, dialogText: string, logger: Logger, maxTokens: number = DEFAULT_MAX_TOKENS, options?: { stripQuotes?: boolean }): Promise<AiReply | null> {
			for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
				try {
					const params: Record<string, unknown> = {
						model: provider.model,
						messages: [
							{ role: "system", content: systemPrompt },
							{ role: "user", content: dialogText },
						],
						temperature: 0.9,
					};
					// Живой баг: OpenAI (gpt-5-mini) отклоняет max_tokens 400-й ошибкой
					// ("Unsupported parameter... Use 'max_completion_tokens' instead")
					// — новые модели требуют переименованный параметр, старый общий
					// max_tokens больше не работает. DeepSeek по-прежнему принимает
					// max_tokens нормально (все успешные вызовы это подтверждают).
					if (providerId === "openai") {
						params.max_completion_tokens = maxTokens;
					} else {
						params.max_tokens = maxTokens;
					}
					// Поля не из типов openai SDK — специфика провайдеров, шлём как есть поверх типизированного вызова.
					if (providerId === "deepseek") params.thinking = { type: "disabled" };
					if (providerId === "openai") params.reasoning_effort = "minimal";

					const response = await openai.chat.completions.create(params as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
					const text = response.choices[0]?.message?.content;
					if (!text) {
						// Пустой content без исключения — раньше было видно только по
						// внешнему логу "produced no reply" без единой зацепки, почему.
						// finishReason/reasoningPresent — на случай, если thinking всё
						// же где-то проскочит (например, при смене модели/провайдера
						// в панели на другую reasoning-модель).
						const choice = response.choices[0];
						logger.warn("AI response had empty content", {
							provider: provider.label,
							model: provider.model,
							finishReason: choice?.finish_reason ?? null,
							hasReasoningContent: Boolean((choice?.message as { reasoning_content?: string } | undefined)?.reasoning_content),
						});
						return null;
					}
					const stripQuotes = options?.stripQuotes ?? true;
					return {
						text: stripQuotes ? text.replace(/"/g, "") : text,
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
