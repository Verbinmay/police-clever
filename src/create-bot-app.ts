import express, { type Express } from "express";
import { Telegraf } from "telegraf";
import type { BotContext } from "./bot-context.ts";
import type { PartDefinition, Repositories } from "./bot-part.ts";
import { createDataSource } from "./db/data-source.ts";
import { AdminAccountsRepository } from "./db/repositories/admin-accounts-repository.ts";
import { AiUsageRepository } from "./db/repositories/ai-usage-repository.ts";
import { BirthdaysRepository } from "./db/repositories/birthdays-repository.ts";
import { ChatsRepository } from "./db/repositories/chats-repository.ts";
import { LogsRepository } from "./db/repositories/logs-repository.ts";
import { MessagesRepository } from "./db/repositories/messages-repository.ts";
import { MuteVotesRepository } from "./db/repositories/mute-votes-repository.ts";
import { SettingsRepository } from "./db/repositories/settings-repository.ts";
import { TopicsRepository } from "./db/repositories/topics-repository.ts";
import { UsersRepository } from "./db/repositories/users-repository.ts";
import { createLogger, type Logger } from "./logger/logger.ts";
import { createCorePart } from "./parts/core/index.ts";

export interface BotAppConfig {
	botToken: string;
	databaseUrl: string;
	webhookBaseUrl: string;
	webhookPath: string;
	webhookSecretToken: string;
	port: number;
	/** Смысловые части бота — см. src/bot-part.ts и src/parts/{ai-fun,mute-vote}. */
	parts: PartDefinition[];
}

export interface BotApp {
	bot: Telegraf<BotContext>;
	app: Express;
	dataSource: ReturnType<typeof createDataSource>;
	logger: Logger;
	repos: Repositories;
	start(): Promise<void>;
	stop(): Promise<void>;
}

/**
 * Бутстрап бота: один Telegraf на вебхуке + Express-сервер + подключение к
 * БД + единый логгер. В отличие от bots-platform здесь нет эксклюзивного
 * роутера "одна тема → одна часть" — `core`-часть (см.
 * src/parts/core/index.ts) сама решает пассивную регистрацию чата/темы и
 * лог сообщений, а каждая содержательная часть (ai-fun/mute-vote) сама
 * проверяет свой тумблер темы и работает независимо от остальных.
 */
export function createBotApp(config: BotAppConfig): BotApp {
	const dataSource = createDataSource(config.databaseUrl);
	const logsRepository = new LogsRepository(dataSource);
	const logger = createLogger("system", "app", logsRepository);

	const repos: Repositories = {
		chats: new ChatsRepository(dataSource),
		topics: new TopicsRepository(dataSource),
		messages: new MessagesRepository(dataSource),
		users: new UsersRepository(dataSource),
		muteVotes: new MuteVotesRepository(dataSource),
		settings: new SettingsRepository(dataSource),
		aiUsage: new AiUsageRepository(dataSource),
		logs: logsRepository,
		adminAccounts: new AdminAccountsRepository(dataSource),
		birthdays: new BirthdaysRepository(dataSource),
	};

	const bot = new Telegraf<BotContext>(config.botToken);
	bot.catch((err, ctx) => {
		logger.error("Unhandled error in bot update", { updateType: ctx.updateType }, err);
	});

	const app = express();
	app.use(express.json());
	app.get("/health", (_req, res) => res.json({ ok: true }));

	async function start() {
		await dataSource.initialize();
		logger.info("Database connected");

		// core — не "часть" в смысле PartDefinition (у неё нет своего
		// тумблера в панели, она всегда активна), но собрана по тому же
		// Composer-паттерну для единообразия и обязательно регистрируется
		// первой — остальные части полагаются на то, что Chat/Topic уже
		// зарегистрированы и сообщение уже залогировано.
		bot.use((await createCorePart().setup({ bot, dataSource, repos, logger: createLogger("core", "app", logsRepository) })).middleware());

		for (const part of config.parts) {
			const partLogger = createLogger(part.id, "app", logsRepository);
			const composer = await part.setup({ bot, dataSource, repos, logger: partLogger });
			bot.use(composer.middleware());
		}

		const webhookMiddleware = bot.webhookCallback(config.webhookPath, { secretToken: config.webhookSecretToken });
		app.use(async (req, res, next) => {
			try {
				await webhookMiddleware(req, res, next);
			} catch (err) {
				// telegraf.handleUpdate только гарантирует res.end() вокруг
				// прогона миддлварей — если botInfo ещё не прогрет (см. ниже)
				// и getMe() падает прямо на входящем апдейте, res.end() в
				// telegraf'е не вызывается вообще и запрос виснет навсегда.
				// Подстраховываемся сами: отвечаем 200, чтобы Telegram не
				// долбил повторами бесконечно, и логируем.
				logger.error("Webhook handler failed", {}, err);
				if (!res.writableEnded) res.status(200).end();
			}
		});

		await new Promise<void>((resolve) => {
			app.listen(config.port, () => resolve());
		});

		logger.info(`Listening on port ${config.port}, webhook path ${config.webhookPath}`);

		// Прогреваем bot.botInfo заранее: без этого telegraf лениво дёргает
		// getMe() на первом же входящем апдейте (мы не используем bot.launch(),
		// который делает это сам) — если в этот момент Telegram API временно
		// недоступен, обработка апдейта падает ДО того как telegraf успевает
		// отправить ответ (см. try/catch выше — это лишь сеть подстраховки).
		try {
			bot.botInfo = await bot.telegram.getMe();
			logger.info("Bot info fetched", { username: bot.botInfo.username });
		} catch (err) {
			logger.error("Не удалось получить botInfo (getMe) — проверьте BOT_TOKEN", {}, err);
		}

		// Сервер уже поднят (health/вебхук-приёмник зарегистрированы) — если
		// setWebhook не пройдёт (неверный токен, временный сбой Telegram
		// API), это не должно ронять весь процесс и мешать остальному (в
		// частности — админ-панели, которая монтируется в index.ts сразу
		// после start()).
		try {
			await bot.telegram.setWebhook(`${config.webhookBaseUrl}${config.webhookPath}`, {
				secret_token: config.webhookSecretToken,
			});
		} catch (err) {
			logger.error("Не удалось установить webhook — бот не будет получать обновления, пока это не исправлено", {}, err);
		}
	}

	async function stop() {
		await bot.telegram.deleteWebhook().catch(() => {});
		if (dataSource.isInitialized) await dataSource.destroy();
	}

	return { bot, app, dataSource, logger, repos, start, stop };
}

/** Вешает SIGINT/SIGTERM на аккуратную остановку бота. */
export function setupGracefulShutdown(botApp: Pick<BotApp, "stop" | "logger">): void {
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, async () => {
			botApp.logger.info(`Received ${signal}, shutting down`);
			await botApp.stop();
			process.exit(0);
		});
	}
	process.on("uncaughtException", (err) => botApp.logger.error("Uncaught exception", {}, err));
	process.on("unhandledRejection", (err) => botApp.logger.error("Unhandled rejection", {}, err));
}
