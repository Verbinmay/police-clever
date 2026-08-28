import { Router } from "express";
import type { Telegram } from "telegraf";
import type { MuteVotesRepository } from "../../db/repositories/mute-votes-repository.ts";
import type { TopicsRepository } from "../../db/repositories/topics-repository.ts";
import type { Logger } from "../../logger/logger.ts";
import { unmuteUser } from "../../parts/mute-vote/mute.ts";

/** История голосований за мьют (по всем чатам сразу или по одному, ?chatId=) + ручное снятие мьюта — часть "логирования всего". */
export function createVotesRouter(muteVotes: MuteVotesRepository, topics: TopicsRepository, telegram: Telegram, logger: Logger): Router {
	const router = Router();

	router.get("/", async (req, res) => {
		const limit = req.query.limit ? Number(req.query.limit) : 50;
		const chatId = typeof req.query.chatId === "string" ? req.query.chatId : undefined;

		const votes = await muteVotes.listRecent(limit, chatId);
		const withDetails = await Promise.all(
			votes.map(async (vote) => {
				const [{ yes, no }, topic] = await Promise.all([muteVotes.countBallots(vote.id), topics.get(vote.chatId, vote.threadId)]);
				return { ...vote, yes, no, topicName: topic?.topicName ?? null };
			}),
		);
		res.json(withDetails);
	});

	router.post("/:voteId/unmute", async (req, res) => {
		const { voteId } = req.params;
		if (!voteId) {
			res.status(400).json({ error: "voteId обязателен" });
			return;
		}

		const vote = await muteVotes.findById(voteId);
		if (!vote) {
			res.status(404).json({ error: "Голосование не найдено" });
			return;
		}
		if (vote.status !== "muted") {
			res.status(400).json({ error: `Мьют не применён (текущий статус: ${vote.status})` });
			return;
		}

		const ok = await unmuteUser(telegram, vote.chatId, vote.targetTgId, logger);
		if (!ok) {
			res.status(502).json({ error: "Telegram отказал в снятии мьюта (бот без прав в чате?)" });
			return;
		}

		await muteVotes.setStatus(voteId, "unmuted");
		logger.info("Mute manually lifted from admin panel", { voteId, chatId: vote.chatId, target: vote.targetTgId });
		res.json({ ok: true });
	});

	return router;
}
