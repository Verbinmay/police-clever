import { EntitySchema } from "typeorm";

export type BallotChoice = "yes" | "no";

/**
 * Один голос в MuteVote. Составной pk (voteId, voterTgId) — гарантия "один
 * голос на пользователя" на уровне БД, без ручных проверок гонок.
 */
export interface MuteVoteBallot {
	voteId: string;
	voterTgId: string;
	choice: BallotChoice;
	votedAt: Date;
}

export const MuteVoteBallotSchema = new EntitySchema<MuteVoteBallot>({
	name: "MuteVoteBallot",
	tableName: "mute_vote_ballots",
	columns: {
		voteId: { type: "uuid", primary: true, name: "vote_id" },
		voterTgId: { type: "text", primary: true, name: "voter_tg_id" },
		choice: { type: "text" },
		votedAt: { type: "timestamptz", name: "voted_at", createDate: true },
	},
});
