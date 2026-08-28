import { EntitySchema } from "typeorm";

export type MuteVoteStatus = "open" | "muted" | "expired" | "unmuted";

/**
 * Голосование за мьют — заводится реплаем спецфразой на сообщение
 * нарушителя (см. src/parts/mute-vote/index.ts). messageId — id сообщения
 * бота с кнопками Да/Нет, которое потом редактируется по итогу.
 */
export interface MuteVote {
	id: string;
	chatId: string;
	threadId: string;
	targetTgId: string;
	/** Денормализовано из ctx.from цели в момент открытия — чтобы не ходить в Telegram за именем при каждой правке сообщения. */
	targetName: string | null;
	requestedByTgId: string;
	messageId: number;
	status: MuteVoteStatus;
	startedAt: Date;
	expiresAt: Date;
	/** До какого момента действует мьют (только для status="muted") — считается от config.muteMinutes в момент мьюта. Используется, чтобы убирать из панели голосования, чей мьют уже сам истёк. */
	mutedUntil: Date | null;
}

export const MuteVoteSchema = new EntitySchema<MuteVote>({
	name: "MuteVote",
	tableName: "mute_votes",
	columns: {
		id: { type: "uuid", primary: true, generated: "uuid" },
		chatId: { type: "text", name: "chat_id" },
		threadId: { type: "text", name: "thread_id" },
		targetTgId: { type: "text", name: "target_tg_id" },
		targetName: { type: "text", nullable: true, name: "target_name" },
		requestedByTgId: { type: "text", name: "requested_by_tg_id" },
		messageId: { type: "int", name: "message_id" },
		status: { type: "text", default: "open" },
		startedAt: { type: "timestamptz", name: "started_at", createDate: true },
		expiresAt: { type: "timestamptz", name: "expires_at" },
		mutedUntil: { type: "timestamptz", name: "muted_until", nullable: true },
	},
	indices: [{ columns: ["chatId", "status"] }],
});
