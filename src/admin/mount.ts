import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { Telegram } from "telegraf";
import type { Repositories } from "../bot-part.ts";
import { config } from "../config.ts";
import type { Logger } from "../logger/logger.ts";
import { csrfOriginCheck } from "./auth.ts";
import { bootstrapAdminAccount } from "./bootstrap.ts";
import { apiRateLimit } from "./rate-limit.ts";
import { requireSession } from "./require-session.ts";
import { readSessionAccountId } from "./session.ts";
import { createAccountsRouter } from "./routes/accounts.ts";
import { createAiConfigRouter } from "./routes/ai-config.ts";
import { createAiRepliesRouter } from "./routes/ai-replies.ts";
import { createAiStatsRouter } from "./routes/ai-stats.ts";
import { createAuthRouter } from "./routes/auth.ts";
import { createBirthdaysRouter } from "./routes/birthdays.ts";
import { createConfigTransferRouter } from "./routes/config-transfer.ts";
import { createLogsRouter } from "./routes/logs.ts";
import { createMuteVoteConfigRouter } from "./routes/mutevote-config.ts";
import { createProviderBillingRouter } from "./routes/provider-billing.ts";
import { createScenarioUsageRouter } from "./routes/scenario-usage.ts";
import { createTopicsRouter } from "./routes/topics.ts";
import { createVotesRouter } from "./routes/votes.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function schedulePruning(repos: Repositories, logger: Logger): NodeJS.Timeout {
	const prune = () => {
		repos.logs.pruneOlderThan(config.LOG_RETENTION_DAYS).catch((err) => {
			logger.error("Failed to prune old logs", {}, err);
		});
		// AiUsage теперь хранит полный текст промпта/контекста/ответа на
		// каждый вызов, не только счётчики — заметно тяжелее, чистим по тому
		// же расписанию/сроку, что и технические логи.
		repos.aiUsage.pruneOlderThan(config.LOG_RETENTION_DAYS).catch((err) => {
			logger.error("Failed to prune old AI usage rows", {}, err);
		});
	};
	prune();
	return setInterval(prune, PRUNE_INTERVAL_MS);
}

/**
 * Подключает админ-панель (API + статика) к уже поднятому Express-
 * приложению бота — тот же процесс, тот же порт, паттерн 1:1 из
 * bots-platform (`admin/mount.ts`). /health и /webhook уже заняты
 * createBotApp, всё остальное навешивается поверх того же приложения.
 *
 * /api/auth/{login,logout,me} — без сессии (это и есть вход); все
 * остальные /api/* — только с валидной cookie (requireSession).
 */
export async function mountAdmin(app: Express, repos: Repositories, logger: Logger, telegram: Telegram, botId: string): Promise<void> {
	await bootstrapAdminAccount(repos.adminAccounts, config.ADMIN_BOOTSTRAP_USERNAME, config.ADMIN_BOOTSTRAP_PASSWORD, logger);
	schedulePruning(repos, logger);

	app.use(csrfOriginCheck);
	// Общий лимит на весь /api (включая вход) — до роутеров. У логина сверху
	// ещё свои, гораздо более жёсткие лимиты (routes/auth.ts).
	app.use("/api", apiRateLimit((req) => readSessionAccountId(req.headers.cookie, config.SESSION_SECRET) !== null));
	app.use("/api/auth", createAuthRouter(repos.adminAccounts));

	app.use("/api/topics", requireSession, createTopicsRouter(repos.chats, repos.topics, repos.settings, repos.aiUsage));
	app.use("/api/ai-config", requireSession, createAiConfigRouter(repos.settings));
	app.use("/api/ai-replies", requireSession, createAiRepliesRouter(repos.aiUsage));
	app.use("/api/mutevote-config", requireSession, createMuteVoteConfigRouter(repos.settings));
	app.use("/api/ai-stats", requireSession, createAiStatsRouter(repos.aiUsage, repos.settings));
	app.use("/api/provider-billing", requireSession, createProviderBillingRouter(logger));
	app.use("/api/scenario-usage", requireSession, createScenarioUsageRouter(repos.settings));
	app.use("/api/birthdays", requireSession, createBirthdaysRouter(repos, logger, botId, telegram));
	app.use("/api/votes", requireSession, createVotesRouter(repos.muteVotes, repos.topics, telegram, logger));
	app.use("/api/logs", requireSession, createLogsRouter(repos.logs));
	app.use("/api/accounts", requireSession, createAccountsRouter(repos.adminAccounts));
	app.use("/api/config-transfer", requireSession, createConfigTransferRouter(repos.settings));

	// no-cache (не no-store) — браузер/Cloudflare обязаны каждый раз
	// перепроверять по ETag, а не тупо переиспользовать старую копию. Без
	// этого Cloudflare сам кэширует .js/.css на 4 часа по умолчанию (по
	// расширению файла, независимо от того, что реально отдаёт Express) —
	// после любого обновления панели админка тихо продолжает работать на
	// старой версии app.js, пока кэш не истечёт сам.
	app.use(
		express.static(path.join(__dirname, "public"), {
			etag: true,
			lastModified: true,
			setHeaders: (res) => res.setHeader("Cache-Control", "no-cache"),
		}),
	);

	// Исключения из маршрутов панели (async доходят сюда через async-router.ts):
	// раньше запрос просто висел до таймаута браузера.
	app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
		logger.error(`Admin API ${req.method} ${req.originalUrl} failed`, {}, err);
		if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
	});
}
