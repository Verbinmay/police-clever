import type { DataSource } from "typeorm";
import { type Chat, ChatSchema } from "../entities/Chat.ts";

export interface EnsureChatInput {
	chatId: string;
	title: string | null;
	isForum: boolean;
}

export class ChatsRepository {
	constructor(private readonly dataSource: DataSource) {}

	private get repo() {
		return this.dataSource.getRepository(ChatSchema);
	}

	/** Пассивная регистрация — не трогает существующую строку (title/isForum можно освежить отдельно). */
	async ensureRegistered(input: EnsureChatInput): Promise<void> {
		const existing = await this.repo.findOneBy({ chatId: input.chatId });
		if (existing) return;
		await this.repo.save(this.repo.create(input));
	}

	async findById(chatId: string): Promise<Chat | null> {
		return this.repo.findOneBy({ chatId });
	}

	async listAll(): Promise<Chat[]> {
		return this.repo.find({ order: { registeredAt: "DESC" } });
	}
}
