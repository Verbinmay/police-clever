import type { NextFunction, Request, Response } from "express";

/**
 * Защита от CSRF на мутирующих запросах: сессионную cookie браузер
 * прикладывает автоматически к любому запросу на этот origin, поэтому для
 * POST/PUT/DELETE дополнительно проверяем заголовок Origin —
 * кросс-сайтовый запрос его либо не пришлёт, либо пришлёт чужой. Порт 1:1
 * из bots-platform (`admin/auth.ts`).
 *
 * Лимиты на логин переехали в routes/auth.ts (вместе с общими лимитами
 * панели из rate-limit.ts) — старый лимит здесь считал по req.ip, а это за
 * Caddy всегда один и тот же адрес на всех.
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
