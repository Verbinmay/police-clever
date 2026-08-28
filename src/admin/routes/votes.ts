import { Router } from "express";
import type { MuteVotesRepository } from "../../db/repositories/mute-votes-repository.ts";

/** История голосований за мьют — часть "логирования всего". */
export function createVotesRouter(muteVotes: MuteVotesRepository): Router {
	const router = Router();

	router.get("/:chatId", async (req, res) => {
		const { chatId } = req.params;
		if (!chatId) {
			res.status(400).json({ error: "chatId обязателен" });
			return;
		}
		res.json(await muteVotes.listByChat(chatId));
	});

	return router;
}
