import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

interface SessionPayload {
	accountId: string;
	exp: number;
}

function sign(payloadB64: string, secret: string): string {
	return createHmac("sha256", secret).update(payloadB64).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}

/**
 * Простая подписанная cookie-сессия (HMAC-SHA256), без внешних
 * зависимостей вроде cookie-session/express-session — нужна была под
 * несколько именных суперадмин-аккаунтов вместо единственной пары
 * Basic Auth из bots-platform (`admin/auth.ts`), сама механика
 * rate-limit-lockout/CSRF оттуда переносится без изменений.
 */
export function createSessionCookie(accountId: string, secret: string): string {
	const payload: SessionPayload = { accountId, exp: Date.now() + SESSION_TTL_MS };
	const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const signature = sign(payloadB64, secret);
	return `${COOKIE_NAME}=${payloadB64}.${signature}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax`;
}

export function clearSessionCookie(): string {
	return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

function parseCookies(header: string | undefined): Record<string, string> {
	if (!header) return {};
	const result: Record<string, string> = {};
	for (const part of header.split(";")) {
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		result[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
	}
	return result;
}

/** Возвращает accountId, если cookie в заголовке валидна и не истекла, иначе null. */
export function readSessionAccountId(cookieHeader: string | undefined, secret: string): string | null {
	const raw = parseCookies(cookieHeader)[COOKIE_NAME];
	if (!raw) return null;

	const dotIndex = raw.lastIndexOf(".");
	if (dotIndex === -1) return null;
	const payloadB64 = raw.slice(0, dotIndex);
	const signature = raw.slice(dotIndex + 1);

	if (!safeEqual(sign(payloadB64, secret), signature)) return null;

	try {
		const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as SessionPayload;
		if (payload.exp < Date.now()) return null;
		return payload.accountId;
	} catch {
		return null;
	}
}
