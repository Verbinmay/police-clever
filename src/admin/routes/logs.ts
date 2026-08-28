import { Router } from "express";
import type { LogLevel } from "../../db/entities/PartLog.ts";
import type { LogsRepository } from "../../db/repositories/logs-repository.ts";

const VALID_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

/** Единая лента логов — "логирование всего". Порт `admin/routes/logs.ts` из bots-platform. */
export function createLogsRouter(logs: LogsRepository): Router {
	const router = Router();

	router.get("/", async (req, res) => {
		const partId = typeof req.query.partId === "string" ? req.query.partId : undefined;
		const levelRaw = typeof req.query.level === "string" ? req.query.level : undefined;
		const level = levelRaw && VALID_LEVELS.includes(levelRaw as LogLevel) ? (levelRaw as LogLevel) : undefined;
		const limit = req.query.limit ? Number(req.query.limit) : undefined;

		res.json(await logs.list({ partId, level, limit }));
	});

	return router;
}
