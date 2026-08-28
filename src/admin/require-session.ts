import type { NextFunction, Request, Response } from "express";
import { config } from "../config.ts";
import { readSessionAccountId } from "./session.ts";

export interface AuthedRequest extends Request {
	adminAccountId?: string;
}

/** Пропускает дальше только запросы с валидной сессионной cookie — вешается на все /api/* панели, кроме /api/login и /api/me. */
export function requireSession(req: AuthedRequest, res: Response, next: NextFunction): void {
	const accountId = readSessionAccountId(req.headers.cookie, config.SESSION_SECRET);
	if (!accountId) {
		res.status(401).json({ error: "Не авторизовано" });
		return;
	}
	req.adminAccountId = accountId;
	next();
}
