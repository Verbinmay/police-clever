import type { DataSource } from "typeorm";
import { LessThan, MoreThanOrEqual } from "typeorm";
import { type AiUsage, type AiUsageKind, AiUsageSchema } from "../entities/AiUsage.ts";

export interface RecordAiUsageInput {
	chatId: string;
	threadId: string;
	kind: AiUsageKind;
	tone: string | null;
	provider: string;
	promptText: string;
	userContent: string;
	replyText: string;
	promptTokens: number;
	completionTokens: number;
	costUsd: number;
}

export interface AiUsageDailyRow {
	day: string;
	calls: number;
	promptTokens: number;
	completionTokens: number;
	costUsd: number;
}

function startOfMonth(): Date {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export class AiUsageRepository {
	constructor(private readonly dataSource: DataSource) {}

	private get repo() {
		return this.dataSource.getRepository(AiUsageSchema);
	}

	async record(input: RecordAiUsageInput): Promise<void> {
		await this.repo.save(this.repo.create(input));
	}

	/** Сколько AI-вызовов было в чате за последние 24 часа — дневной кап на чат, страховка по частоте. */
	async countLast24h(chatId: string): Promise<number> {
		const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
		return this.repo.countBy({ chatId, createdAt: MoreThanOrEqual(since) });
	}

	/**
	 * Время самого старого AI-вызова в текущем скользящем окне 24ч (или
	 * null, если вызовов не было) — по нему считается, когда именно
	 * дневной кап на чат "разгрузится" хотя бы на один слот (для счётчика
	 * в панели). Кап не сбрасывается разом в фиксированное время суток —
	 * окно скользящее, поэтому и точка освобождения тоже "плавающая".
	 */
	async oldestCallInLast24h(chatId: string): Promise<Date | null> {
		const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
		const row = await this.repo.findOne({ where: { chatId, createdAt: MoreThanOrEqual(since) }, order: { createdAt: "ASC" } });
		return row?.createdAt ?? null;
	}

	/** Суммарная оценочная стоимость с начала текущего календарного месяца (UTC), по всем чатам — для глобального $ бюджета. */
	async monthToDateCostUsd(): Promise<number> {
		const since = startOfMonth();
		const row = await this.repo
			.createQueryBuilder("u")
			.select("COALESCE(SUM(u.cost_usd), 0)", "total")
			.where("u.createdAt >= :since", { since })
			.getRawOne<{ total: string }>();
		return Number(row?.total ?? 0);
	}

	/** То же самое, но только за сегодня (UTC) — для "сколько потрачено сегодня" в панели. */
	async todayCostUsd(): Promise<number> {
		const now = new Date();
		const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
		const row = await this.repo
			.createQueryBuilder("u")
			.select("COALESCE(SUM(u.cost_usd), 0)", "total")
			.where("u.createdAt >= :since", { since })
			.getRawOne<{ total: string }>();
		return Number(row?.total ?? 0);
	}

	/** Агрегаты по дням за последние N дней — для экрана статистики в панели. */
	async dailyTotals(days = 30): Promise<AiUsageDailyRow[]> {
		const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
		const rows = await this.repo
			.createQueryBuilder("u")
			.select("date_trunc('day', u.createdAt)", "day")
			.addSelect("COUNT(*)", "calls")
			.addSelect("COALESCE(SUM(u.promptTokens), 0)", "promptTokens")
			.addSelect("COALESCE(SUM(u.completionTokens), 0)", "completionTokens")
			.addSelect("COALESCE(SUM(u.cost_usd), 0)", "costUsd")
			.where("u.createdAt >= :since", { since })
			.groupBy("day")
			.orderBy("day", "DESC")
			.getRawMany<{ day: string; calls: string; promptTokens: string; completionTokens: string; costUsd: string }>();

		return rows.map((row) => ({
			day: row.day,
			calls: Number(row.calls),
			promptTokens: Number(row.promptTokens),
			completionTokens: Number(row.completionTokens),
			costUsd: Number(row.costUsd),
		}));
	}

	async totalsByChat(days = 30): Promise<Array<{ chatId: string; calls: number; costUsd: number }>> {
		const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
		const rows = await this.repo
			.createQueryBuilder("u")
			.select("u.chatId", "chatId")
			.addSelect("COUNT(*)", "calls")
			.addSelect("COALESCE(SUM(u.cost_usd), 0)", "costUsd")
			.where("u.createdAt >= :since", { since })
			.groupBy("u.chatId")
			// Заказ по алиасу камелкейса нужно явно квотить — иначе TypeORM
			// подставляет его в SQL без кавычек, Postgres сворачивает регистр
			// (costUsd -> costusd), а сам алиас в SELECT создан в кавычках
			// ("costUsd") — получается "column costusd does not exist".
			.orderBy('"costUsd"', "DESC")
			.getRawMany<{ chatId: string; calls: string; costUsd: string }>();

		return rows.map((row) => ({ chatId: row.chatId, calls: Number(row.calls), costUsd: Number(row.costUsd) }));
	}

	/** Лог реальных AI-ответов (промпт+контекст+ответ) для панели — свежие сначала, опционально по чату. */
	async listRecent(limit = 50, chatId?: string): Promise<AiUsage[]> {
		return this.repo.find({
			where: chatId ? { chatId } : {},
			order: { createdAt: "DESC" },
			take: limit,
		});
	}

	/** Чистка старых записей — тексты промпта/контекста/ответа занимают заметно больше места, чем голые счётчики. */
	async pruneOlderThan(days: number): Promise<void> {
		const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
		await this.repo.delete({ createdAt: LessThan(cutoff) });
	}
}
