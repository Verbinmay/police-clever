import { EntitySchema } from "typeorm";

/**
 * Тема (форум-топик) внутри супергруппы, либо сам чат целиком, если он не
 * форум (тогда threadId="0" — единственная "тема" чата). Порт идеи
 * `TopicAssignment` из bots-platform, но без эксклюзивного роутинга "тема
 * → одна часть": здесь два независимых тумблера, обе части могут быть
 * активны одновременно в одной теме.
 *
 * Регистрируется пассивно на первое сообщение из ещё не виденной темы
 * (см. src/parts/core/register.ts). По умолчанию оба тумблера выключены —
 * бот в новой теме молчит, пока superadmin не включит её в панели ("подчаты
 * добавляются через админку").
 */
export interface Topic {
	chatId: string;
	threadId: string;
	topicName: string | null;
	aiJokesEnabled: boolean;
	muteVoteEnabled: boolean;
	updatedAt: Date;
}

export const TopicSchema = new EntitySchema<Topic>({
	name: "Topic",
	tableName: "topics",
	columns: {
		chatId: { type: "text", primary: true, name: "chat_id" },
		threadId: { type: "text", primary: true, name: "thread_id" },
		topicName: { type: "text", nullable: true, name: "topic_name" },
		aiJokesEnabled: { type: "boolean", default: false, name: "ai_jokes_enabled" },
		muteVoteEnabled: { type: "boolean", default: false, name: "mute_vote_enabled" },
		updatedAt: { type: "timestamptz", name: "updated_at", updateDate: true },
	},
});
