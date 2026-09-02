import { Router } from "express";
import type { AiUsageRepository } from "../../db/repositories/ai-usage-repository.ts";
import type { ChatsRepository } from "../../db/repositories/chats-repository.ts";
import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import type { TopicsRepository } from "../../db/repositories/topics-repository.ts";
import { loadAiConfig } from "../../parts/ai-fun/config.ts";
import { cooldownRemainingMinutes } from "../../parts/ai-fun/cooldown.ts";
import { peekGachaCounter, setGachaCounter } from "../../parts/ai-fun/gacha.ts";
import { getSummary } from "../../parts/ai-fun/summary.ts";

/**
 * "Подчаты" — чаты и темы внутри них (форум-топики), пассивно
 * зарегистрированные ботом (см. src/parts/core/index.ts). Это и есть
 * "разрешения через админку": пока тумблер выключен, бот в этой теме
 * молчит целиком.
 */
export function createTopicsRouter(chats: ChatsRepository, topics: TopicsRepository, settings: SettingsRepository, aiUsage: AiUsageRepository): Router {
	const router = Router();

	router.get("/", async (_req, res) => {
		const [allChats, allTopics, aiConfig] = await Promise.all([chats.listAll(), topics.listAll(), loadAiConfig(settings)]);

		// Сводка и счётчик гачи — только для тем с включёнными AI-шутками,
		// остальным они всё равно не собираются/не крутятся. summary.enabled
		// временно выключен целиком (см. SummaryConfig.enabled) — если так,
		// не читаем БД вообще, чтобы в панели не показывать замороженную
		// старую сводку как будто она живая.
		const aiTopics = aiConfig.summary.enabled ? allTopics.filter((t) => t.aiJokesEnabled) : [];
		const summaries = await Promise.all(aiTopics.map(async (t) => [`${t.chatId}:${t.threadId}`, await getSummary(settings, t.chatId, t.threadId)] as const));
		const summaryByKey = new Map(summaries);

		// Гача — вероятностная и может сработать раньше guaranteedAt (см.
		// gacha.ts) — счётчик тут это "не позже чем через", а не точный таймер.
		// Один общий счётчик на весь бот (не на тему) — показываем на каждой
		// строке темы с AI-шутками одно и то же значение.
		const gachaCounter = await peekGachaCounter(settings);

		const topicsByChat = new Map<string, typeof allTopics>();
		for (const topic of allTopics) {
			const list = topicsByChat.get(topic.chatId) ?? [];
			list.push(topic);
			topicsByChat.set(topic.chatId, list);
		}

		// Кулдаун и дневной кап — оба на весь чат (не на тему, см. cooldown.ts),
		// поэтому считаются один раз на чат, а не на каждую тему отдельно.
		const chatsWithCounters = await Promise.all(
			allChats.map(async (chat) => {
				const cooldownRemainingMin = await cooldownRemainingMinutes(settings, chat.chatId, aiConfig.cooldownMinutes);

				let dailyCapRemainingMin = 0;
				const callsLast24h = await aiUsage.countLast24h(chat.chatId);
				if (callsLast24h >= aiConfig.dailyCallCapPerChat) {
					const oldest = await aiUsage.oldestCallInLast24h(chat.chatId);
					if (oldest) {
						const freesAt = oldest.getTime() + 24 * 60 * 60 * 1000;
						dailyCapRemainingMin = Math.max(0, Math.ceil((freesAt - Date.now()) / 60_000));
					}
				}

				return { ...chat, cooldownRemainingMin, dailyCapRemainingMin };
			}),
		);

		res.json(
			chatsWithCounters.map((chat) => ({
				...chat,
				topics: (topicsByChat.get(chat.chatId) ?? []).map((t) => ({
					...t,
					summary: summaryByKey.get(`${t.chatId}:${t.threadId}`) ?? null,
					gachaCounter: t.aiJokesEnabled ? gachaCounter : null,
					gachaGuaranteedAt: aiConfig.gachaGuaranteedAt,
				})),
			})),
		);
	});

	router.put("/:chatId/:threadId", async (req, res) => {
		const { chatId, threadId } = req.params;
		if (!chatId || !threadId) {
			res.status(400).json({ error: "chatId/threadId обязательны" });
			return;
		}
		const { aiJokesEnabled, muteVoteEnabled, yesNoEnabled } = req.body as { aiJokesEnabled?: boolean; muteVoteEnabled?: boolean; yesNoEnabled?: boolean };
		const patch: Partial<{ aiJokesEnabled: boolean; muteVoteEnabled: boolean; yesNoEnabled: boolean }> = {};
		if (typeof aiJokesEnabled === "boolean") patch.aiJokesEnabled = aiJokesEnabled;
		if (typeof muteVoteEnabled === "boolean") patch.muteVoteEnabled = muteVoteEnabled;
		if (typeof yesNoEnabled === "boolean") patch.yesNoEnabled = yesNoEnabled;

		const updated = await topics.setToggles(chatId, threadId, patch);
		if (!updated) {
			res.status(404).json({ error: "Тема не найдена" });
			return;
		}
		res.json(updated);
	});

	/** Ручная правка ОБЩЕГО счётчика гачи (один на весь бот, см. gacha.ts) из панели — ускорить/отодвинуть гарантированный ответ, не дожидаясь реальных сообщений. */
	router.put("/gacha-counter", async (req, res) => {
		const { value } = req.body as { value?: number };
		if (typeof value !== "number" || !Number.isFinite(value)) {
			res.status(400).json({ error: "value должен быть числом" });
			return;
		}

		await setGachaCounter(settings, value);
		res.json({ ok: true, value: Math.max(1, Math.floor(value)) });
	});

	return router;
}
