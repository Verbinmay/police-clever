export interface MuteVoteConfig {
	/** Реплай этой фразой на сообщение нарушителя открывает голосование. */
	triggerPhrase: string;
	/** Минимум голосов "да" для мьюта. */
	quorum: number;
	/** Сколько минут голосование открыто. */
	windowMinutes: number;
	/** На сколько минут мьютится цель при успешном голосовании. */
	muteMinutes: number;
}

export const DEFAULT_MUTE_VOTE_CONFIG: MuteVoteConfig = {
	triggerPhrase: "/mutevote",
	quorum: 3,
	windowMinutes: 5,
	muteMinutes: 30,
};
