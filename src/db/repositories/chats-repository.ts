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

	/**
	 * Пассивная регистрация — не трогает существующую строку (title/isForum
	 * можно освежить отдельно). Возвращает саму запись (не void) — core/
	 * index.ts читает chat.birthdaysEnabled сразу же, без второго похода в
	 * БД.
	 */
	async ensureRegistered(input: EnsureChatInput): Promise<Chat> {
		const existing = await this.repo.findOneBy({ chatId: input.chatId });
		if (existing) return existing;
		return this.repo.save(this.repo.create({ ...input, birthdaysEnabled: false }));
	}

	async findById(chatId: string): Promise<Chat | null> {
		return this.repo.findOneBy({ chatId });
	}

	async listAll(): Promise<Chat[]> {
		return this.repo.find({ order: { registeredAt: "DESC" } });
	}

	/** Тумблер учёта дней рождения — на весь чат целиком, см. комментарий у Chat.birthdaysEnabled. */
	async setBirthdaysEnabled(chatId: string, enabled: boolean): Promise<Chat | null> {
		const existing = await this.repo.findOneBy({ chatId });
		if (!existing) return null;
		existing.birthdaysEnabled = enabled;
		return this.repo.save(existing);
	}
}
