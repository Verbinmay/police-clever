import type { Telegram } from "telegraf";
import type { Repositories } from "../../bot-part.ts";
import type { Logger } from "../../logger/logger.ts";
import { CONGRATS_CHECK_INTERVAL_MS, runBirthdayCongratulations } from "./congratulate.ts";
import { runBirthdayScan, SCAN_INTERVAL_MS } from "./scan.ts";

/** Периодическое обновление профилей/дат рождения — раз в 48ч, см. scan.ts. botId — исключить бота из "участников" (он тоже пишет в лог сообщений, но не человек). */
export function startBirthdayScanCron(repos: Repositories, logger: Logger, botId: string, telegram: Telegram): NodeJS.Timeout {
	const run = () => {
		runBirthdayScan(repos, logger, botId, telegram).catch((err) => {
			logger.error("Не удалось выполнить скан дней рождения", {}, err);
		});
	};
	run();
	return setInterval(run, SCAN_INTERVAL_MS);
}

/** Проверка "у кого сегодня др" — раз в час, см. congratulate.ts (сам job идемпотентен на день, повторный тик не шлёт дубликат). */
export function startBirthdayCongratsCron(repos: Repositories, telegram: Telegram, logger: Logger): NodeJS.Timeout {
	const run = () => {
		runBirthdayCongratulations(repos, telegram, logger).catch((err) => {
			logger.error("Не удалось выполнить рассылку поздравлений", {}, err);
		});
	};
	run();
	return setInterval(run, CONGRATS_CHECK_INTERVAL_MS);
}
