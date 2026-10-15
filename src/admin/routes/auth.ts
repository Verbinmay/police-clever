import argon2 from "argon2";
import { Router } from "../async-router.ts";
import { setTimeout as sleep } from "node:timers/promises";
import type { AdminAccountsRepository } from "../../db/repositories/admin-accounts-repository.ts";
import { config } from "../../config.ts";
import { clientIp, RateLimiter, sendTooManyRequests } from "../rate-limit.ts";
import { readSessionAccountId, createSessionCookie, clearSessionCookie } from "../session.ts";

const MINUTE = 60_000;
/** Пауза перед ответом на неверный пароль — делает перебор медленным даже в пределах лимитов. */
const FAILURE_DELAY_MS = 1000;
/** Пауза, когда со всех IP вместе неудач слишком много (вероятный перебор с подменой IP). */
const SURGE_DELAY_MS = 5000;

/**
 * Логин/логаут/"кто я" — единственные /api-маршруты панели, доступные без сессии.
 *
 * Лимиты на вход (все в памяти процесса, см. rate-limit.ts):
 *  - любых попыток с одного IP — 10 за 15 минут;
 *  - неудачных с одного IP — 5 за 15 минут;
 *  - неудачных на один логин больше 10 за час (перебор пароля конкретного
 *    аккаунта с разных IP) — замедление, как ниже;
 *  - если неудачных со всех IP вместе больше 30 за 15 минут (перебор с
 *    подменой IP в обход Cloudflare) — каждая попытка входа отвечает с
 *    паузой 5 с, но НЕ блокируется: полная блокировка по общему счётчику
 *    позволила бы любому закрыть вход владельцу.
 * Успешный вход сбрасывает счётчики неудач этого IP и логина.
 */
export function createAuthRouter(accounts: AdminAccountsRepository): Router {
	const router = Router();
	const attemptsPerIp = new RateLimiter(10, 15 * MINUTE);
	const failuresPerIp = new RateLimiter(5, 15 * MINUTE);
	const failuresPerUser = new RateLimiter(10, 60 * MINUTE);
	const failuresGlobal = new RateLimiter(30, 15 * MINUTE);

	router.post("/login", async (req, res) => {
		const ip = clientIp(req);
		const rawUsername = ((req.body ?? {}) as { username?: unknown }).username;
		const userKey = typeof rawUsername === "string" ? rawUsername.trim().toLowerCase() : "";

		const wait = Math.max(attemptsPerIp.blockedFor(ip), failuresPerIp.blockedFor(ip));
		if (wait > 0) {
			sendTooManyRequests(res, wait, "Слишком много попыток входа.");
			return;
		}
		attemptsPerIp.hit(ip);
		if (failuresGlobal.blockedFor("all") > 0 || (userKey && failuresPerUser.blockedFor(userKey) > 0)) await sleep(SURGE_DELAY_MS);

		const { username, password } = req.body as { username?: string; password?: string };
		if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
			res.status(400).json({ error: "Укажите логин и пароль" });
			return;
		}

		const account = await accounts.findByUsername(username);
		const valid = account ? await argon2.verify(account.passwordHash, password).catch(() => false) : false;
		if (!account || !valid) {
			failuresPerIp.hit(ip);
			failuresGlobal.hit("all");
			if (userKey) failuresPerUser.hit(userKey);
			await sleep(FAILURE_DELAY_MS);
			res.status(401).json({ error: "Неверный логин или пароль" });
			return;
		}

		failuresPerIp.reset(ip);
		if (userKey) failuresPerUser.reset(userKey);
		res.setHeader("Set-Cookie", createSessionCookie(account.id, config.SESSION_SECRET));
		res.json({ ok: true, username: account.username });
	});

	router.post("/logout", (_req, res) => {
		res.setHeader("Set-Cookie", clearSessionCookie());
		res.json({ ok: true });
	});

	router.get("/me", async (req, res) => {
		const accountId = readSessionAccountId(req.headers.cookie, config.SESSION_SECRET);
		if (!accountId) {
			res.status(401).json({ error: "Не авторизовано" });
			return;
		}
		const account = await accounts.findById(accountId);
		if (!account) {
			res.status(401).json({ error: "Не авторизовано" });
			return;
		}
		res.json({ id: account.id, username: account.username });
	});

	return router;
}
