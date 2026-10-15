import type { NextFunction, Request, Response } from "express";

/**
 * Реальный IP клиента. Цепочка: Cloudflare → Caddy → контейнер, поэтому
 * req.ip — это всегда адрес Caddy в docker-сети, один на всех (лимит по нему
 * душил бы и владельца вместе с атакующим). Берём CF-Connecting-IP
 * (выставляет Cloudflare), затем первый адрес из X-Forwarded-For (Caddy).
 *
 * Оба заголовка можно подделать, если ходить на VPS в обход Cloudflare —
 * поэтому у логина, помимо лимитов по IP, есть общее замедление при массе
 * неудач со всех IP (см. routes/auth.ts), а у /api — общий потолок для
 * запросов без сессии.
 */
export function clientIp(req: Request): string {
	const cf = req.headers["cf-connecting-ip"];
	if (typeof cf === "string" && cf) return cf.trim();
	const xff = req.headers["x-forwarded-for"];
	const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
	return first || req.socket.remoteAddress || "unknown";
}

interface Bucket {
	count: number;
	resetAt: number;
}

/**
 * Простой счётчик с фиксированным окном, в памяти процесса (бот — один
 * процесс, переживать рестарт лимитам не нужно). Без внешних зависимостей,
 * как и остальная механика панели (сессии, CSRF).
 */
export class RateLimiter {
	private readonly buckets = new Map<string, Bucket>();

	constructor(
		readonly max: number,
		readonly windowMs: number,
	) {
		// Чистка истёкших окон, чтобы карта не росла от перебора ключей.
		setInterval(() => {
			const now = Date.now();
			for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
		}, windowMs).unref();
	}

	private bucket(key: string): Bucket {
		const now = Date.now();
		let bucket = this.buckets.get(key);
		if (!bucket || bucket.resetAt <= now) {
			bucket = { count: 0, resetAt: now + this.windowMs };
			this.buckets.set(key, bucket);
		}
		return bucket;
	}

	/** Секунд до разблокировки, если лимит исчерпан, иначе 0 — без учёта новой попытки. */
	blockedFor(key: string): number {
		const bucket = this.bucket(key);
		return bucket.count >= this.max ? Math.ceil((bucket.resetAt - Date.now()) / 1000) : 0;
	}

	hit(key: string): void {
		this.bucket(key).count += 1;
	}

	reset(key: string): void {
		this.buckets.delete(key);
	}
}

export function sendTooManyRequests(res: Response, retryAfterSec: number, message: string): void {
	res.setHeader("Retry-After", String(retryAfterSec));
	res.status(429).json({ error: `${message} Повторите через ${formatWait(retryAfterSec)}.` });
}

function formatWait(sec: number): string {
	if (sec < 60) return `${sec} с`;
	return `${Math.ceil(sec / 60)} мин`;
}

/**
 * Лимит на весь /api панели: по IP на любые запросы и отдельно, строже, на
 * изменяющие (POST/PUT/DELETE). Плюс общий потолок на всех — страховка на
 * случай подмены IP, — но только для запросов БЕЗ валидной сессии: иначе
 * любой посторонний мог бы забить общий счётчик мусорными запросами и
 * закрыть панель уже вошедшему владельцу. Цифры с запасом под обычную
 * работу: открытие вкладки — 1-3 запроса, сохранение — 1.
 */
export function apiRateLimit(isAuthenticated: (req: Request) => boolean) {
	const perIp = new RateLimiter(120, 60_000);
	const writesPerIp = new RateLimiter(30, 60_000);
	const globalAnonymous = new RateLimiter(600, 60_000);

	return (req: Request, res: Response, next: NextFunction): void => {
		const ip = clientIp(req);
		const isWrite = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
		const anonymous = !isAuthenticated(req);

		const wait = Math.max(perIp.blockedFor(ip), anonymous ? globalAnonymous.blockedFor("all") : 0, isWrite ? writesPerIp.blockedFor(ip) : 0);
		if (wait > 0) {
			sendTooManyRequests(res, wait, "Слишком много запросов к панели.");
			return;
		}

		perIp.hit(ip);
		if (anonymous) globalAnonymous.hit("all");
		if (isWrite) writesPerIp.hit(ip);
		next();
	};
}
