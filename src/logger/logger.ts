import type { LogLevel } from "../db/entities/PartLog.ts";
import type { LogsRepository } from "../db/repositories/logs-repository.ts";

export interface Logger {
	debug(message: string, context?: Record<string, unknown>, err?: unknown): void;
	info(message: string, context?: Record<string, unknown>, err?: unknown): void;
	warn(message: string, context?: Record<string, unknown>, err?: unknown): void;
	error(message: string, context?: Record<string, unknown>, err?: unknown): void;
}

const CONSOLE_BY_LEVEL: Record<LogLevel, (...args: unknown[]) => void> = {
	debug: console.debug,
	info: console.info,
	warn: console.warn,
	error: console.error,
};

function serializeError(err: unknown): Record<string, unknown> | undefined {
	if (!err) return undefined;
	if (err instanceof Error) return { error: err.message, stack: err.stack };
	return { error: String(err) };
}

/**
 * Логгер, общий для бота и админки: пишет в stdout (виден в `docker logs`)
 * и одновременно, без ожидания вызывающим кодом, в таблицу `part_logs` —
 * это то, что показывает единая лента логов в панели ("логирование
 * всего" — по решению пользователя вызывается на каждое действие: чат/
 * тема зарегистрированы, AI ответил, голосование открыто/закрыто/мьют
 * применён, ошибка). Порт 1:1 из bots-platform (`logger/logger.ts`).
 */
export function createLogger(partId: string, module: string, logsRepository: LogsRepository): Logger {
	function emit(level: LogLevel, message: string, context?: Record<string, unknown>, err?: unknown) {
		const errCtx = serializeError(err);
		const fullContext = errCtx || context ? { ...context, ...errCtx } : undefined;

		CONSOLE_BY_LEVEL[level](`[${partId}] [${module}] ${message}`, fullContext ?? "");

		logsRepository.write({ partId, level, module, message, context: fullContext ?? null }).catch((writeErr) => {
			console.error(`[${partId}] [logger] Failed to persist log to DB:`, writeErr);
		});
	}

	return {
		debug: (message, context, err) => emit("debug", message, context, err),
		info: (message, context, err) => emit("info", message, context, err),
		warn: (message, context, err) => emit("warn", message, context, err),
		error: (message, context, err) => emit("error", message, context, err),
	};
}
