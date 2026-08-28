import { Brackets, type DataSource } from "typeorm";
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

	/** Успешный мьют по итогам голосования — статус + до какого момента он действует (см. MuteVote.mutedUntil). */
	async markMuted(id: string, mutedUntil: Date): Promise<void> {
		await this.votes.update({ id }, { status: "muted", mutedUntil });
	}

	async setMessageId(id: string, messageId: number): Promise<void> {
		await this.votes.update({ id }, { messageId });
	}

	async listByChat(chatId: string, limit = 100): Promise<MuteVote[]> {
		return this.votes.find({ where: { chatId }, order: { startedAt: "DESC" }, take: limit });
	}

	/** История голосований для панели — свежие сначала, опционально по чату (без chatId — по всем сразу). */
	async listRecent(limit = 50, chatId?: string): Promise<MuteVote[]> {
		return this.votes.find({ where: chatId ? { chatId } : {}, order: { startedAt: "DESC" }, take: limit });
	}

	/**
	 * То же самое, но только то, что сейчас реально актуально: голосование
	 * ещё идёт, либо мьют по нему всё ещё действует. Голосования без
	 * кворума (expired), снятые вручную (unmuted) и с истёкшим по времени
	 * мьютом из списка пропадают — это не полный архивный лог, а "что
	 * сейчас может требовать внимания" (в частности — кого можно снять с
	 * мьюта кнопкой в панели). mutedUntil=null (старые записи до этого
	 * поля) считаем ещё актуальными — лучше показать лишнее, чем спрятать
	 * реально активный мьют.
	 */
	async listRelevant(limit = 50, chatId?: string): Promise<MuteVote[]> {
		const qb = this.votes
			.createQueryBuilder("v")
			.where(
				new Brackets((sub) => {
					sub.where("v.status = :open", { open: "open" }).orWhere("v.status = :muted AND (v.mutedUntil IS NULL OR v.mutedUntil > :now)", { muted: "muted", now: new Date() });
				}),
			)
			.orderBy("v.startedAt", "DESC")
			.take(limit);
		if (chatId) qb.andWhere("v.chatId = :chatId", { chatId });
		return qb.getMany();
	}
}
