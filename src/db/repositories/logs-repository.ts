import type { DataSource } from "typeorm";
import { LessThan } from "typeorm";
import { type LogLevel, type PartLog, PartLogSchema } from "../entities/PartLog.ts";

export interface WriteLogInput {
	partId: string;
	level: LogLevel;
	module: string;
	message: string;
	context?: Record<string, unknown> | null;
}

export interface ListLogsFilter {
	partId?: string;
	level?: LogLevel;
	limit?: number;
}

/** Порт 1:1 из bots-platform (`db/repositories/logs-repository.ts`). */
export class LogsRepository {
	constructor(private readonly dataSource: DataSource) {}

	private get repo() {
		return this.dataSource.getRepository(PartLogSchema);
	}

	async write(input: WriteLogInput): Promise<void> {
		const log = this.repo.create({
			partId: input.partId,
			level: input.level,
			module: input.module,
			message: input.message,
			context: input.context ?? null,
		});
		await this.repo.save(log);
	}

	async list(filter: ListLogsFilter = {}): Promise<PartLog[]> {
		return this.repo.find({
			where: {
				...(filter.partId ? { partId: filter.partId } : {}),
				...(filter.level ? { level: filter.level } : {}),
			},
			order: { createdAt: "DESC" },
			take: filter.limit ?? 200,
		});
	}

	/** Чистка старых логов, чтобы таблица не росла бесконечно. */
	async pruneOlderThan(days: number): Promise<void> {
		const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
		await this.repo.delete({ createdAt: LessThan(cutoff) });
	}
}
