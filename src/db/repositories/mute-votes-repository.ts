import type { DataSource } from "typeorm";
import { type BallotChoice, MuteVoteBallotSchema } from "../entities/MuteVoteBallot.ts";
import { type MuteVote, type MuteVoteStatus, MuteVoteSchema } from "../entities/MuteVote.ts";

export interface OpenVoteInput {
	/** Генерируется вызывающим кодом заранее (randomUUID) — нужен ДО отправки сообщения с клавиатурой, чтобы callback_data сразу были настоящими. */
	id: string;
	chatId: string;
	threadId: string;
	targetTgId: string;
	targetName: string | null;
	requestedByTgId: string;
	messageId: number;
	expiresAt: Date;
}

export class MuteVotesRepository {
	constructor(private readonly dataSource: DataSource) {}

	private get votes() {
		return this.dataSource.getRepository(MuteVoteSchema);
	}
	private get ballots() {
		return this.dataSource.getRepository(MuteVoteBallotSchema);
	}

	async open(input: OpenVoteInput): Promise<MuteVote> {
		return this.votes.save(this.votes.create({ ...input, status: "open" as const }));
	}

	async findById(id: string): Promise<MuteVote | null> {
		return this.votes.findOneBy({ id });
	}

	/** Защита от спама голосованиями — не даём открыть второе, пока по этой же цели в этой теме уже идёт одно. */
	async findOpenByTarget(chatId: string, threadId: string, targetTgId: string): Promise<MuteVote | null> {
		return this.votes.findOneBy({ chatId, threadId, targetTgId, status: "open" });
	}

	/** true — голос принят впервые; false — юзер уже голосовал (повторный клик игнорируем). */
	async castBallot(voteId: string, voterTgId: string, choice: BallotChoice): Promise<boolean> {
		const existing = await this.ballots.findOneBy({ voteId, voterTgId });
		if (existing) return false;
		await this.ballots.save(this.ballots.create({ voteId, voterTgId, choice }));
		return true;
	}

	async countBallots(voteId: string): Promise<{ yes: number; no: number }> {
		const [yes, no] = await Promise.all([
			this.ballots.countBy({ voteId, choice: "yes" }),
			this.ballots.countBy({ voteId, choice: "no" }),
		]);
		return { yes, no };
	}

	async setStatus(id: string, status: MuteVoteStatus): Promise<void> {
		await this.votes.update({ id }, { status });
	}

	async setMessageId(id: string, messageId: number): Promise<void> {
		await this.votes.update({ id }, { messageId });
	}

	async listByChat(chatId: string, limit = 100): Promise<MuteVote[]> {
		return this.votes.find({ where: { chatId }, order: { startedAt: "DESC" }, take: limit });
	}
}
