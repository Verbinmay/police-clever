import argon2 from "argon2";
import { Router } from "express";
import type { AdminAccountsRepository } from "../../db/repositories/admin-accounts-repository.ts";
import type { AuthedRequest } from "../require-session.ts";

/** CRUD суперадмин-аккаунтов панели — "возможность добавлять админам аккаунты". Все аккаунты равноправны. */
export function createAccountsRouter(accounts: AdminAccountsRepository): Router {
	const router = Router();

	router.get("/", async (_req, res) => {
		const all = await accounts.listAll();
		res.json(all.map((a) => ({ id: a.id, username: a.username, createdAt: a.createdAt })));
	});

	router.post("/", async (req, res) => {
		const { username, password } = req.body as { username?: string; password?: string };
		if (!username || !password || password.length < 8) {
			res.status(400).json({ error: "Логин обязателен, пароль — от 8 символов" });
			return;
		}
		const existing = await accounts.findByUsername(username);
		if (existing) {
			res.status(409).json({ error: "Такой логин уже занят" });
			return;
		}
		const passwordHash = await argon2.hash(password);
		const account = await accounts.create(username, passwordHash);
		res.status(201).json({ id: account.id, username: account.username });
	});

	router.delete("/:id", async (req: AuthedRequest, res) => {
		const { id } = req.params as { id: string };
		if (id === req.adminAccountId) {
			res.status(400).json({ error: "Нельзя удалить свой же аккаунт, пока вы в нём" });
			return;
		}
		const remaining = await accounts.listAll();
		if (remaining.length <= 1) {
			res.status(400).json({ error: "Должен остаться хотя бы один аккаунт" });
			return;
		}
		await accounts.delete(id);
		res.json({ ok: true });
	});

	return router;
}
