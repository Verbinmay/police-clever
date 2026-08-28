import type { MessagesRepository } from "../../db/repositories/messages-repository.ts";
import type { Logger } from "../../logger/logger.ts";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // раз в час
const MESSAGE_RETENTION_HOURS = 15; // порт utilSettings.deleteMessagesTimeInHours из старого police-clever

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
