import { Router } from "express";
import type { ChatsRepository } from "../../db/repositories/chats-repository.ts";
import type { TopicsRepository } from "../../db/repositories/topics-repository.ts";

/**
 * "Подчаты" — чаты и темы внутри них (форум-топики), пассивно
 * зарегистрированные ботом (см. src/parts/core/index.ts). Это и есть
 * "разрешения через админку": пока тумблер выключен, бот в этой теме
 * молчит целиком.
 */
export function createTopicsRouter(chats: ChatsRepository, topics: TopicsRepository): Router {
	const router = Router();

	router.get("/", async (_req, res) => {
		const [allChats, allTopics] = await Promise.all([chats.listAll(), topics.listAll()]);
		const topicsByChat = new Map<string, typeof allTopics>();
		for (const topic of allTopics) {
			const list = topicsByChat.get(topic.chatId) ?? [];
			list.push(topic);
			topicsByChat.set(topic.chatId, list);
		}

		res.json(
			allChats.map((chat) => ({
				...chat,
				topics: topicsByChat.get(chat.chatId) ?? [],
			})),
		);
	});

	router.put("/:chatId/:threadId", async (req, res) => {
		const { chatId, threadId } = req.params;
		if (!chatId || !threadId) {
			res.status(400).json({ error: "chatId/threadId обязательны" });
			return;
		}
		const { aiJokesEnabled, muteVoteEnabled } = req.body as { aiJokesEnabled?: boolean; muteVoteEnabled?: boolean };
		const patch: Partial<{ aiJokesEnabled: boolean; muteVoteEnabled: boolean }> = {};
		if (typeof aiJokesEnabled === "boolean") patch.aiJokesEnabled = aiJokesEnabled;
		if (typeof muteVoteEnabled === "boolean") patch.muteVoteEnabled = muteVoteEnabled;

		const updated = await topics.setToggles(chatId, threadId, patch);
		if (!updated) {
			res.status(404).json({ error: "Тема не найдена" });
			return;
		}
		res.json(updated);
	});

	return router;
}
