import argon2 from "argon2";
import { Router } from "express";
import type { AdminAccountsRepository } from "../../db/repositories/admin-accounts-repository.ts";
import { config } from "../../config.ts";
import { clearFailures, isLockedOut, loginClientKey, recordFailure } from "../auth.ts";
import { readSessionAccountId, createSessionCookie, clearSessionCookie } from "../session.ts";

/** Логин/логаут/"кто я" — единственные /api-маршруты панели, доступные без сессии. */
export function createAuthRouter(accounts: AdminAccountsRepository): Router {
	const router = Router();

	router.post("/login", async (req, res) => {
		const key = loginClientKey(req);
		if (isLockedOut(key)) {
			res.status(429).json({ error: "Слишком много неудачных попыток входа. Попробуйте позже." });
			return;
		}

		const { username, password } = req.body as { username?: string; password?: string };
		if (!username || !password) {
			res.status(400).json({ error: "Укажите логин и пароль" });
			return;
		}

		const account = await accounts.findByUsername(username);
		const valid = account ? await argon2.verify(account.passwordHash, password).catch(() => false) : false;
		if (!account || !valid) {
			recordFailure(key);
			res.status(401).json({ error: "Неверный логин или пароль" });
			return;
		}

		clearFailures(key);
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
