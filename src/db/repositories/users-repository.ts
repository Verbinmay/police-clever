import type { DataSource } from "typeorm";
import { type BotUser, BotUserSchema } from "../entities/BotUser.ts";

export interface TouchUserInput {
	tgId: string;
	username?: string | null;
	firstName?: string | null;
}

/** Порт 1:1 из bots-platform (`db/repositories/users-repository.ts`). */
export class UsersRepository {
	constructor(private readonly dataSource: DataSource) {}

	private get repo() {
		return this.dataSource.getRepository(BotUserSchema);
	}

	/** Обновляет username/last_seen_at или создаёт запись, если пользователь новый. */
	async touch(input: TouchUserInput): Promise<void> {
		await this.repo.upsert(
			{
				tgId: input.tgId,
				username: input.username ?? null,
				firstName: input.firstName ?? null,
			},
			["tgId"],
		);
	}

	async listAll(): Promise<BotUser[]> {
		return this.repo.find({ order: { lastSeenAt: "DESC" } });
	}
}
