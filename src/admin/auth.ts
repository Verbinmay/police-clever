import type { NextFunction, Request, Response } from "express";

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

interface AttemptState {
	count: number;
	firstFailureAt: number;
}

const failedAttempts = new Map<string, AttemptState>();

function clientKey(req: Request): string {
	return req.ip ?? "unknown";
}

/** Rate-limit по IP на попытки логина — порт 1:1 из bots-platform (`admin/auth.ts`). */
export function isLockedOut(key: string): boolean {
	const state = failedAttempts.get(key);
	if (!state) return false;
	if (Date.now() - state.firstFailureAt > LOCKOUT_WINDOW_MS) {
		failedAttempts.delete(key);
		return false;
	}
	return state.count >= MAX_FAILED_ATTEMPTS;
}

export function recordFailure(key: string): void {
	const state = failedAttempts.get(key);
	if (!state || Date.now() - state.firstFailureAt > LOCKOUT_WINDOW_MS) {
		failedAttempts.set(key, { count: 1, firstFailureAt: Date.now() });
		return;
	}
	state.count += 1;
}

export function clearFailures(key: string): void {
	failedAttempts.delete(key);
}

export function loginClientKey(req: Request): string {
	return clientKey(req);
}

/**
 * Защита от CSRF на мутирующих запросах: сессионную cookie браузер
 * прикладывает автоматически к любому запросу на этот origin, поэтому для
 * POST/PUT/DELETE дополнительно проверяем заголовок Origin —
 * кросс-сайтовый запрос его либо не пришлёт, либо пришлёт чужой. Порт 1:1
 * из bots-platform (`admin/auth.ts`).
 */
export function csrfOriginCheck(req: Request, res: Response, next: NextFunction): void {
	if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
		next();
		return;
	}

	const origin = req.headers.origin;
	if (!origin) {
		next();
		return;
	}

	const expectedHost = req.headers.host;
	let originHost: string | null = null;
	try {
		originHost = new URL(origin).host;
	} catch {
		originHost = null;
	}

	if (originHost && originHost === expectedHost) {
		next();
		return;
	}

	res.status(403).json({ error: "Cross-origin request rejected" });
}
