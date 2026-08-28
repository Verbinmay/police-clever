import { Router } from "express";
import type { AiUsageRepository } from "../../db/repositories/ai-usage-repository.ts";

/** Лог реальных AI-ответов — промпт, отправленный контекст, сам ответ. Следить за тем, что бот реально генерит. */
export function createAiRepliesRouter(aiUsage: AiUsageRepository): Router {
	const router = Router();

	router.get("/", async (req, res) => {
		const limit = req.query.limit ? Number(req.query.limit) : 50;
		const chatId = typeof req.query.chatId === "string" ? req.query.chatId : undefined;
		res.json(await aiUsage.listRecent(limit, chatId));
	});

	return router;
}
