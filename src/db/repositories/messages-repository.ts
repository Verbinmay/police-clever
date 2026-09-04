import type { DataSource } from "typeorm";
import { LessThan, MoreThanOrEqual } from "typeorm";
import { type Message, MessageSchema } from "../entities/Message.ts";

export interface SaveMessageInput {
	chatId: string;
	threadId: string;
	tgId: string;
	fromName: string | null;
	text: string;
}

export class MessagesRepository {
	constructor(private readonly dataSource: DataSource) {}

	private get repo() {
		return this.dataSource.getRepository(MessageSchema);
	}

	async save(input: SaveMessageInput): Promise<void> {
		await this.repo.save(this.repo.create(input));
	}

	/** Последние n сообщений темы (для AI-контекста), в хронологическом порядке. */
	async findLastNInThread(chatId: string, threadId: string, n: number): Promise<Message[]> {
		const rows = await this.repo.find({
			where: { chatId, threadId },
			order: { createdAt: "DESC" },
			take: n,
		});
		return rows.reverse();
	}

	/**
	 * Все сообщения ЧАТА (по всем его темам разом) с указанного момента, в
	 * хронологическом порядке — для скана дней рождения
	 * (parts/birthdays/scan.ts): тумблер учёта там на весь чат, а не на
	 * отдельную тему (см. Chat.birthdaysEnabled), поэтому и скан читает
	 * сразу весь чат одним запросом, а не по каждой теме отдельно.
	 */
	async findSinceInChat(chatId: string, since: Date): Promise<Message[]> {
		return this.repo.find({
			where: { chatId, createdAt: MoreThanOrEqual(since) },
			order: { createdAt: "ASC" },
		});
	}

	/** Чистка старых сообщений — почасовой крон, лог не должен расти бесконечно. */
	async deleteOlderThanHours(hours: number): Promise<void> {
		const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
		await this.repo.delete({ createdAt: LessThan(cutoff) });
	}
}
