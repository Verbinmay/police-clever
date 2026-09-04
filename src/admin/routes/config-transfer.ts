import { Router } from "express";
import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import { loadAiConfig, saveAiConfig } from "../../parts/ai-fun/config.ts";
import type { AiConfig } from "../../parts/ai-fun/default-config.ts";
import { loadBirthdaysConfig, saveBirthdaysConfig } from "../../parts/birthdays/config.ts";
import type { BirthdaysConfig } from "../../parts/birthdays/default-config.ts";
import { loadMuteVoteConfig, saveMuteVoteConfig } from "../../parts/mute-vote/config.ts";
import type { MuteVoteConfig } from "../../parts/mute-vote/default-config.ts";

const EXPORT_VERSION = 1;

interface ConfigExport {
	exportVersion: number;
	exportedAt: string;
	ai: AiConfig;
	mutevote: MuteVoteConfig;
	birthdays: BirthdaysConfig;
}

/**
 * Выгрузка/загрузка ВСЕГО настраиваемого конфига разом (все промпты и
 * настройки из вкладок AI-конфиг/Голосование/Дни рождения) — по прямому
 * требованию, как страховка "на всякий случай": можно скачать текущее
 * состояние в файл и в любой момент откатиться на него, если после
 * дальнейших правок что-то разладится.
 *
 * Сознательно НЕ включает: рабочие данные (чаты/темы/сообщения/участники/
 * дни рождения людей/аккаунты панели/логи/статистику AI) и рантайм-
 * счётчики (кулдауны, счётчик гачи, счётчик использования сценариев,
 * lastScanAt/congratsSentOn) — это не "конфиг", а живое состояние, его
 * откат конфига трогать не должен.
 *
 * Импорт — тот же shallow-merge на каждую секцию, что и у обычных PUT
 * .../ai-config, .../mutevote-config, .../birthdays/config: файл от более
 * старой версии бота без части новых полей всё равно применится, не
 * обнулив то, чего в нём нет.
 */
export function createConfigTransferRouter(settings: SettingsRepository): Router {
	const router = Router();

	router.get("/", async (_req, res) => {
		const [ai, mutevote, birthdays] = await Promise.all([loadAiConfig(settings), loadMuteVoteConfig(settings), loadBirthdaysConfig(settings)]);

		const payload: ConfigExport = {
			exportVersion: EXPORT_VERSION,
			exportedAt: new Date().toISOString(),
			ai,
			mutevote,
			birthdays,
		};

		res.json(payload);
	});

	router.post("/", async (req, res) => {
		const body = req.body as Partial<ConfigExport>;
		if (!body || typeof body !== "object" || (!body.ai && !body.mutevote && !body.birthdays)) {
			res.status(400).json({ error: "Файл не похож на экспорт конфига этого бота — нужны секции ai/mutevote/birthdays" });
			return;
		}

		if (body.ai) {
			const current = await loadAiConfig(settings);
			await saveAiConfig(settings, { ...current, ...body.ai });
		}
		if (body.mutevote) {
			const current = await loadMuteVoteConfig(settings);
			await saveMuteVoteConfig(settings, { ...current, ...body.mutevote });
		}
		if (body.birthdays) {
			const current = await loadBirthdaysConfig(settings);
			await saveBirthdaysConfig(settings, { ...current, ...body.birthdays });
		}

		res.json({ ok: true });
	});

	return router;
}
