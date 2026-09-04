import type { Composer, Telegraf } from "telegraf";
import type { DataSource } from "typeorm";
import type { AdminAccountsRepository } from "./db/repositories/admin-accounts-repository.ts";
import type { AiUsageRepository } from "./db/repositories/ai-usage-repository.ts";
import type { BirthdaysRepository } from "./db/repositories/birthdays-repository.ts";
import type { ChatsRepository } from "./db/repositories/chats-repository.ts";
import type { LogsRepository } from "./db/repositories/logs-repository.ts";
import type { MessagesRepository } from "./db/repositories/messages-repository.ts";
import type { MuteVotesRepository } from "./db/repositories/mute-votes-repository.ts";
import type { SettingsRepository } from "./db/repositories/settings-repository.ts";
import type { TopicsRepository } from "./db/repositories/topics-repository.ts";
import type { UsersRepository } from "./db/repositories/users-repository.ts";
import type { BotContext } from "./bot-context.ts";
import type { Logger } from "./logger/logger.ts";

/** Общий набор репозиториев, доступный любой части и админ-панели. */
export interface Repositories {
	chats: ChatsRepository;
	topics: TopicsRepository;
	messages: MessagesRepository;
	users: UsersRepository;
	muteVotes: MuteVotesRepository;
	settings: SettingsRepository;
	aiUsage: AiUsageRepository;
	logs: LogsRepository;
	/** Суперадмин-аккаунты панели — частям бота не нужны, но живут в общем наборе репозиториев для единообразия с админкой. */
	adminAccounts: AdminAccountsRepository;
	birthdays: BirthdaysRepository;
}

export interface PartSetupContext {
	bot: Telegraf<BotContext>;
	dataSource: DataSource;
	repos: Repositories;
	/** Уже создан с этим partId, module="app". */
	logger: Logger;
}

/**
 * Смысловая часть бота (ai-fun / mute-vote — их всего две, см. src/parts).
 * Порт идеи `PartDefinition` из bots-platform, но без `entities` (все
 * сущности общие и объявлены заранее в db/data-source.ts — частей мало,
 * заводить под каждую отдельный набор таблиц избыточно) и без `afterStart`
 * (ни одной части он не понадобился).
 */
export interface PartDefinition {
	id: string;
	setup(ctx: PartSetupContext): Composer<BotContext> | Promise<Composer<BotContext>>;
}
