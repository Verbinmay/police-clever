import type { DataSource } from "typeorm";
import { LessThan, MoreThanOrEqual } from "typeorm";
import { type AiUsage, type AiUsageKind, AiUsageSchema } from "../entities/AiUsage.ts";

export interface RecordAiUsageInput {
	chatId: string;
	threadId: string;
	kind: AiUsageKind;
	provider: string;
	promptText: string;
	userContent: string;
	replyText: string;
	promptTokens: number;
	completionTokens: number;
	costUsd: number;
	scenario?: string;
	model?: string;
	latencyMs?: number;
	botMessageId?: string | null;
}

export interface ScenarioStatsRow {
	scenario: string;
	calls: number;
	/** Доля ответов, собравших хотя бы одну реакцию или реплай, 0..1. */
	engagedShare: number;
	avgReactions: number;
	avgReplies: number;
	avgReplyLength: number;
	avgLatencyMs: number;
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

	/**
	 * Реакции на ответ бота: Telegram шлёт по каждому пользователю старый и
	 * новый набор его реакций, отсюда дельта, а не абсолютное значение.
	 * GREATEST — на случай снятия реакции, поставленной до того, как бот
	 * начал их получать (иначе счётчик ушёл бы в минус).
	 */
	async addReactions(chatId: string, botMessageId: string, delta: number): Promise<boolean> {
		const result = await this.repo
			.createQueryBuilder()
			.update()
			.set({ reactions: () => `GREATEST(reactions + ${Math.trunc(delta)}, 0)` })
			.where("chat_id = :chatId AND bot_message_id = :botMessageId", { chatId, botMessageId })
			.execute();
		return (result.affected ?? 0) > 0;
	}

	/** Анонимные реакции (message_reaction_count) приходят сразу итоговым числом — его и ставим. */
	async setReactions(chatId: string, botMessageId: string, total: number): Promise<boolean> {
		const result = await this.repo.update({ chatId, botMessageId }, { reactions: Math.max(0, total) });
		return (result.affected ?? 0) > 0;
	}

	async incrementReplies(chatId: string, botMessageId: string): Promise<boolean> {
		const result = await this.repo.increment({ chatId, botMessageId }, "replies", 1);
		return (result.affected ?? 0) > 0;
	}

	/**
	 * Какие сценарии заходят: по каждому — сколько выпадал, доля ответов с
	 * хоть какой-то реакцией/реплаем, средние реакции/реплаи/длина/задержка.
	 * Только записи с привязанным сообщением (botMessageId) — у старых
	 * записей реакции не собирались вовсе, они бы занижали средние нулями.
	 */
	async scenarioStats(days = 30): Promise<ScenarioStatsRow[]> {
		const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
		const rows = await this.repo
			.createQueryBuilder("u")
			.select("u.scenario", "scenario")
			.addSelect("COUNT(*)", "calls")
			.addSelect("AVG(CASE WHEN u.reactions + u.replies > 0 THEN 1 ELSE 0 END)", "engagedShare")
			.addSelect("AVG(u.reactions)", "avgReactions")
			.addSelect("AVG(u.replies)", "avgReplies")
			.addSelect("AVG(LENGTH(u.reply_text))", "avgReplyLength")
			.addSelect("AVG(u.latency_ms)", "avgLatencyMs")
			.where("u.createdAt >= :since", { since })
			.andWhere("u.scenario <> ''")
			.andWhere("u.bot_message_id IS NOT NULL")
			.groupBy("u.scenario")
			.orderBy('"engagedShare"', "DESC")
			.addOrderBy('"avgReactions"', "DESC")
			.getRawMany<Record<keyof ScenarioStatsRow, string>>();

		return rows.map((row) => ({
			scenario: row.scenario,
			calls: Number(row.calls),
			engagedShare: Number(row.engagedShare),
			avgReactions: Number(row.avgReactions),
			avgReplies: Number(row.avgReplies),
			avgReplyLength: Number(row.avgReplyLength),
			avgLatencyMs: Number(row.avgLatencyMs),
		}));
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
