import { Composer } from "telegraf";
import type { BotContext } from "../../bot-context.ts";
import type { PartDefinition, PartSetupContext } from "../../bot-part.ts";
import { config as appConfig } from "../../config.ts";
import type { AiUsageKind } from "../../db/entities/AiUsage.ts";
import { cropTextForMessage } from "../../shared/crop-text-for-message.ts";
import { getThreadId, isGroupChat } from "../../shared/telegram.ts";
import { type AiClient, createAiClient } from "./ai-client.ts";
import { estimateCostUsd, isOverMonthlyBudget } from "./budget.ts";
import { loadAiConfig } from "./config.ts";
import { isOnCooldown, markCooldown } from "./cooldown.ts";
import { buildChatContext, buildSystemPrompt, buildUserContent } from "./dialog.ts";
import type { AiConfig } from "./default-config.ts";
import { apiKeyEnvVar, type ProviderId } from "./providers.ts";
import { rollGacha } from "./gacha.ts";
import { getSummary, maybeUpdateSummary } from "./summary.ts";
import { pickAction } from "./tone.ts";

function toThreadIdParam(threadId: string): number | undefined {
	return threadId === "0" ? undefined : Number(threadId);
}

function pickRandom<T>(items: T[]): T {
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return items[Math.floor(Math.random() * items.length)]!;
}

const API_KEYS: Record<ProviderId, string> = {
	deepseek: appConfig.DEEPSEEK_API_KEY,
	openai: appConfig.OPENAI_API_KEY,
};

/**
 * AI-шутки: бот следит за разговором и иногда встревает — по имени
 * (триггер-слово, безусловно) или сам (пассивная "гача"), с одним из
 * четырёх настроений (general/targeted/sarcasm/praise, см. tone.ts) —
 * плюс лёгкий бесплатный флейвор на "да"/"нет" (не расходует AI-бюджет).
 *
 * Стоимость развязана с активностью чата и ограничена сразу с четырёх
 * сторон:
 *  1. Контекст — бюджет по символам + роллинг-саммари (dialog.ts,
 *     summary.ts), а не "последние N сообщений".
 *  2. Персистентный общий кулдаун между ЛЮБЫМИ AI-ответами в чате
 *     (cooldown.ts) — не только у триггер-слова, как было раньше.
 *  3. Дневной кап вызовов НА ЧАТ (AiConfig.dailyCallCapPerChat).
 *  4. Глобальный месячный $ потолок НА ВЕСЬ БОТ (AiConfig.monthlyBudgetUsd,
 *     см. budget.ts) — считается по фактическим ценам провайдера на
 *     момент каждого вызова (AiUsage.costUsd), самая прямая страховка.
 *
 * Провайдер (DeepSeek/OpenAI) переключается в панели без передеплоя —
 * оба клиента собираются один раз при старте (если ключ задан в env), а
 * дальше на каждый вызов выбирается активный по AiConfig.provider.
 */
export function createAiFunPart(): PartDefinition {
	return {
		id: "ai-fun",
		setup({ repos, logger }: PartSetupContext) {
			const composer = new Composer<BotContext>();

			// Не кэшируем клиента по id провайдера: baseURL/модель редактируются
			// в панели без передеплоя, а конструирование OpenAI-клиента не
			// делает сетевых запросов — кэш только рисковал бы держать
			// устаревшие baseURL/модель после правки в конфиге.
			function getClient(config: AiConfig, provider: ProviderId): AiClient | null {
				const apiKey = API_KEYS[provider];
				if (!apiKey) {
					logger.error(`Провайдер "${provider}" выбран активным, но ${apiKeyEnvVar(provider)} не задан в env`, { provider });
					return null;
				}
				return createAiClient(config.providers[provider], apiKey);
			}

			composer.on("text", async (ctx, next) => {
				const chat = ctx.chat;
				if (!isGroupChat(chat)) return next();

				const chatId = String(chat.id);
				const threadId = getThreadId(ctx);
				const topic = await repos.topics.get(chatId, threadId);
				if (!topic?.aiJokesEnabled) return next();

				const text = ctx.message.text;
				const config = await loadAiConfig(repos.settings);
				const aiClient = getClient(config, config.provider);

				// Обслуживание саммари не зависит от того, сработает ли шутка на
				// этом конкретном сообщении — считает объём независимо. Без
				// живого клиента (ключ не задан) просто пропускаем.
				if (aiClient) {
					await maybeUpdateSummary(aiClient, repos.messages, repos.settings, chatId, threadId, config, logger);
				}

				// Бесплатный флейвор — не расходует AI-бюджет и не участвует в кулдауне.
				const normalized = text.trim().toLowerCase();
				if (normalized === "да" || normalized === "нет") {
					if (Math.random() < config.yesNoReplyProbability) {
						const answer = normalized === "да" ? pickRandom(config.yesAnswers) : pickRandom(config.noAnswers);
						await ctx.reply(answer, { message_thread_id: toThreadIdParam(threadId) }).catch(() => {});
					}
					return next();
				}

				const isTriggered = Boolean(config.triggerWord) && text.includes(config.triggerWord);
				const wantsGacha = !isTriggered && (await rollGacha(repos.settings, chatId, config));
				if (!isTriggered && !wantsGacha) return next();

				if (!aiClient) return next(); // провайдер выбран, но ключ не настроен — уже залогировано выше

				if (await isOnCooldown(repos.settings, chatId, config.cooldownMinutes)) {
					logger.debug("AI reply skipped: cooldown", { chatId, threadId });
					return next();
				}
				if ((await repos.aiUsage.countLast24h(chatId)) >= config.dailyCallCapPerChat) {
					logger.warn("AI reply skipped: daily cap reached", { chatId, cap: config.dailyCallCapPerChat });
					return next();
				}
				if (await isOverMonthlyBudget(repos.aiUsage, config.monthlyBudgetUsd)) {
					logger.warn("AI reply skipped: monthly budget reached", { chatId, monthlyBudgetUsd: config.monthlyBudgetUsd });
					return next();
				}

				const kind: AiUsageKind = isTriggered ? "trigger" : "gacha";
				const context = await buildChatContext(repos.messages, chatId, threadId, config);
				const summary = await getSummary(repos.settings, chatId);

				const action = isTriggered ? `${text} - тебе написали, ответь` : pickAction(config, context.activeParticipants).action;
				const prompt = buildSystemPrompt(config, action);
				const userContent = buildUserContent(context, summary);

				const reply = await aiClient.getReply(prompt, userContent, logger, config.maxTokens);
				if (!reply) {
					logger.warn("AI request produced no reply", { chatId, threadId, kind });
					return next();
				}

				// Кулдаун ставим только на реально состоявшийся ответ — неудачный
				// запрос (сеть/лимиты провайдера) не должен сжигать окно.
				await markCooldown(repos.settings, chatId);

				for (const chunk of cropTextForMessage(reply.text)) {
					await ctx.telegram.sendMessage(chatId, chunk, { message_thread_id: toThreadIdParam(threadId) }).catch(() => {});
				}

				const costUsd = estimateCostUsd(reply.promptTokens, reply.completionTokens, config.providers[config.provider]);
				await repos.aiUsage.record({ chatId, kind, provider: config.provider, promptTokens: reply.promptTokens, completionTokens: reply.completionTokens, costUsd });
				logger.info("AI replied", { chatId, threadId, kind, provider: config.provider, costUsd });

				return next();
			});

			logger.info("ai-fun part ready");
			return composer;
		},
	};
}
