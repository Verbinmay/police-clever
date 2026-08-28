import type { DataSource } from "typeorm";
import { type Topic, TopicSchema } from "../entities/Topic.ts";

export interface EnsureTopicInput {
	chatId: string;
	threadId: string;
	topicName?: string | null;
}

/**
 * Порт идеи `topics-repository.ts` из bots-platform, адаптированный под
 * два независимых тумблера вместо эксклюзивного назначения одной части.
 */
export class TopicsRepository {
	constructor(private readonly dataSource: DataSource) {}

	private get repo() {
		return this.dataSource.getRepository(TopicSchema);
	}

	/** Регистрирует тему при первом сообщении оттуда — оба тумблера по умолчанию выключены. */
	async ensureRegistered(input: EnsureTopicInput): Promise<Topic> {
		const existing = await this.repo.findOneBy({ chatId: input.chatId, threadId: input.threadId });
		if (existing) {
			if (input.topicName && input.topicName !== existing.topicName) {
				existing.topicName = input.topicName;
				await this.repo.save(existing);
			}
			return existing;
		}
		return this.repo.save(
			this.repo.create({
				chatId: input.chatId,
				threadId: input.threadId,
				topicName: input.topicName ?? null,
				aiJokesEnabled: false,
				muteVoteEnabled: false,
			}),
		);
	}

	async get(chatId: string, threadId: string): Promise<Topic | null> {
		return this.repo.findOneBy({ chatId, threadId });
	}

	async listAll(): Promise<Topic[]> {
		return this.repo.find({ order: { updatedAt: "DESC" } });
	}

	async setToggles(chatId: string, threadId: string, patch: Partial<Pick<Topic, "aiJokesEnabled" | "muteVoteEnabled">>): Promise<Topic | null> {
		const existing = await this.repo.findOneBy({ chatId, threadId });
		if (!existing) return null;
		Object.assign(existing, patch);
		return this.repo.save(existing);
	}
}
