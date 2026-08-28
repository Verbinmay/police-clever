import { Markup } from "telegraf";
import type { MuteVoteConfig } from "./default-config.ts";

export function voteText(targetName: string, yes: number, no: number, config: MuteVoteConfig, resultLine?: string): string {
	const base = `🗳 Голосование за мьют для ${targetName} (нужно ${config.quorum}+ "да", ${config.windowMinutes} мин на голосование)\n\n✅ Да: ${yes}\n❌ Нет: ${no}`;
	return resultLine ? `${base}\n\n${resultLine}` : base;
}

export function voteKeyboard(voteId: string) {
	return Markup.inlineKeyboard([
		Markup.button.callback("✅ Да", `mv:${voteId}:yes`),
		Markup.button.callback("❌ Нет", `mv:${voteId}:no`),
	]);
}
