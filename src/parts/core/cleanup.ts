import type { MessagesRepository } from "../../db/repositories/messages-repository.ts";
import type { Logger } from "../../logger/logger.ts";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // раз в час
// Было 15 (порт utilSettings.deleteMessagesTimeInHours из старого police-clever).
// Увеличено до 60 (2.5 суток) под сканирование дней рождения (см.
// parts/birthdays/scan.ts) — оно проходит раз в 48ч, и должно видеть ВСЕ
// сообщения с прошлого раза, а не только последние 15 часов. Для AI-шуток
// на объём context это не влияет — buildChatContext режет по количеству/
// символам, а не по возрасту, старые сообщения просто не попадают в окно.
const MESSAGE_RETENTION_HOURS = 60;

/**
 * Почасовая чистка локального лога сообщений (порт
 * `deleteNHoursOldMessages`/крона из старого police-clever) — без
 * внешнего планировщика, простой setInterval хватает для одного процесса.
 */
export function startMessageCleanupCron(messages: MessagesRepository, logger: Logger): NodeJS.Timeout {
	const run = () => {
		messages.deleteOlderThanHours(MESSAGE_RETENTION_HOURS).catch((err) => {
			logger.error("Failed to clean up old messages", {}, err);
		});
	};
	run();
	return setInterval(run, CLEANUP_INTERVAL_MS);
}
