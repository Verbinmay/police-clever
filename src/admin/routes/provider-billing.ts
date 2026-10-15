import { Router } from "express";
import { config } from "../../config.ts";
import type { Logger } from "../../logger/logger.ts";

const CACHE_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

type DeepSeekBilling =
	| { configured: false }
	| { configured: true; error: string }
	| { configured: true; available: boolean; balances: Array<{ currency: string; total: number; granted: number; toppedUp: number }> };

type OpenAiBilling =
	| { configured: false }
	| { configured: true; error: string }
	| { configured: true; monthCostUsd: number; todayCostUsd: number; byProject: Array<{ project: string; costUsd: number }> };

interface BillingSnapshot {
	fetchedAt: string;
	deepseek: DeepSeekBilling;
	openai: OpenAiBilling;
}

async function getJson<T>(url: string, apiKey: string): Promise<T> {
	const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
	}
	return (await res.json()) as T;
}

/** DeepSeek отдаёт баланс обычному API-ключу — тот же, которым бот генерирует ответы. */
async function fetchDeepSeek(): Promise<DeepSeekBilling> {
	if (!config.DEEPSEEK_API_KEY) return { configured: false };
	try {
		const data = await getJson<{ is_available: boolean; balance_infos: Array<{ currency: string; total_balance: string; granted_balance: string; topped_up_balance: string }> }>(
			"https://api.deepseek.com/user/balance",
			config.DEEPSEEK_API_KEY,
		);
		return {
			configured: true,
			available: data.is_available,
			balances: data.balance_infos.map((b) => ({ currency: b.currency, total: Number(b.total_balance), granted: Number(b.granted_balance), toppedUp: Number(b.topped_up_balance) })),
		};
	} catch (err) {
		return { configured: true, error: (err as Error).message };
	}
}

interface CostsPage {
	data: Array<{ start_time: number; results: Array<{ amount?: { value?: number }; project_id?: string | null }> }>;
	has_more?: boolean;
	next_page?: string | null;
}

/**
 * Расходы OpenAI — только по админ-ключу (sk-admin-…, OPENAI_ADMIN_KEY):
 * обычный проектный ключ бота получает 403 "Missing scopes: api.usage.read".
 * Остатка на счёте (предоплаченных кредитов) публичный API OpenAI не отдаёт
 * вообще — только расходы. Расходы — по всей организации, с разбивкой по
 * проектам (если на том же аккаунте есть что-то кроме бота).
 */
async function fetchOpenAi(): Promise<OpenAiBilling> {
	if (!config.OPENAI_ADMIN_KEY) return { configured: false };
	try {
		const now = new Date();
		const monthStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
		const todayStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000);

		let monthCostUsd = 0;
		let todayCostUsd = 0;
		const byProjectId = new Map<string, number>();
		let page: string | null | undefined;
		do {
			const params = new URLSearchParams({ start_time: String(monthStart), bucket_width: "1d", limit: "31", group_by: "project_id" });
			if (page) params.set("page", page);
			const data = await getJson<CostsPage>(`https://api.openai.com/v1/organization/costs?${params}`, config.OPENAI_ADMIN_KEY);
			for (const bucket of data.data) {
				for (const result of bucket.results) {
					const value = result.amount?.value ?? 0;
					monthCostUsd += value;
					if (bucket.start_time >= todayStart) todayCostUsd += value;
					const projectId = result.project_id ?? "без проекта";
					byProjectId.set(projectId, (byProjectId.get(projectId) ?? 0) + value);
				}
			}
			page = data.has_more ? data.next_page : null;
		} while (page);

		// Имена проектов — для читаемости; если не получилось, остаются id.
		const names = new Map<string, string>();
		try {
			const projects = await getJson<{ data: Array<{ id: string; name: string }> }>("https://api.openai.com/v1/organization/projects?limit=100", config.OPENAI_ADMIN_KEY);
			for (const p of projects.data) names.set(p.id, p.name);
		} catch {
			// не критично
		}

		const byProject = [...byProjectId.entries()].map(([id, costUsd]) => ({ project: names.get(id) ?? id, costUsd })).sort((a, b) => b.costUsd - a.costUsd);
		return { configured: true, monthCostUsd, todayCostUsd, byProject };
	} catch (err) {
		return { configured: true, error: (err as Error).message };
	}
}

/**
 * Реальное состояние счетов у провайдеров — в отличие от "Бюджета" в той же
 * вкладке, который считается ботом по оценочным ценам (budget.ts). Кэш на
 * час: панель могут обновлять часто, а провайдеров дёргать незачем;
 * ?refresh=1 (кнопка "Обновить сейчас") — принудительно, мимо кэша.
 */
export function createProviderBillingRouter(logger: Logger): Router {
	const router = Router();
	let cached: { at: number; snapshot: BillingSnapshot } | null = null;

	router.get("/", async (req, res) => {
		if (!cached || req.query.refresh === "1" || Date.now() - cached.at > CACHE_MS) {
			const [deepseek, openai] = await Promise.all([fetchDeepSeek(), fetchOpenAi()]);
			if ("error" in deepseek) logger.warn("Не удалось получить баланс DeepSeek", { error: deepseek.error });
			if ("error" in openai) logger.warn("Не удалось получить расходы OpenAI", { error: openai.error });
			cached = { at: Date.now(), snapshot: { fetchedAt: new Date().toISOString(), deepseek, openai } };
		}
		res.json(cached.snapshot);
	});

	return router;
}
