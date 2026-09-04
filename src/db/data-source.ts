import { DataSource } from "typeorm";
import { AdminAccountSchema } from "./entities/AdminAccount.ts";
import { AiUsageSchema } from "./entities/AiUsage.ts";
import { BirthdaySchema } from "./entities/Birthday.ts";
import { BotUserSchema } from "./entities/BotUser.ts";
import { ChatSchema } from "./entities/Chat.ts";
import { MessageSchema } from "./entities/Message.ts";
import { MuteVoteSchema } from "./entities/MuteVote.ts";
import { MuteVoteBallotSchema } from "./entities/MuteVoteBallot.ts";
import { PartLogSchema } from "./entities/PartLog.ts";
import { PartSettingSchema } from "./entities/PartSetting.ts";
import { TopicSchema } from "./entities/Topic.ts";

const ENTITIES = [
	ChatSchema,
	TopicSchema,
	MessageSchema,
	BotUserSchema,
	MuteVoteSchema,
	MuteVoteBallotSchema,
	AdminAccountSchema,
	AiUsageSchema,
	PartLogSchema,
	PartSettingSchema,
	BirthdaySchema,
];

/**
 * Сущности объявлены через EntitySchema, а не декораторы — без билд-шага
 * (бот запускается через tsx) decorator-metadata TypeORM не работает
 * корректно с esbuild-транспиляцией, EntitySchema этой проблемы лишена.
 * Паттерн 1:1 из bots-platform (`db/data-source.ts`).
 *
 * synchronize:true — сознательное упрощение (по решению пользователя):
 * миграции для бота такого масштаба избыточны, схема держится в синхроне
 * с кодом.
 */
export function createDataSource(databaseUrl: string, logging = false): DataSource {
	return new DataSource({
		type: "postgres",
		url: databaseUrl,
		synchronize: true,
		logging,
		entities: ENTITIES,
	});
}
