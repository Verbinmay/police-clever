import { mountAdmin } from "./admin/mount.ts";
import { config } from "./config.ts";
import { createBotApp, setupGracefulShutdown } from "./create-bot-app.ts";
import { startBirthdayCongratsCron, startBirthdayScanCron } from "./parts/birthdays/cron.ts";
import { startMessageCleanupCron } from "./parts/core/cleanup.ts";
import { createAiFunPart } from "./parts/ai-fun/index.ts";
import { createMuteVotePart } from "./parts/mute-vote/index.ts";

const parts = [createAiFunPart(), createMuteVotePart()];

const botApp = createBotApp({
	botToken: config.BOT_TOKEN,
	databaseUrl: config.DATABASE_URL,
	webhookBaseUrl: config.WEBHOOK_BASE_URL,
	webhookPath: config.WEBHOOK_PATH,
	webhookSecretToken: config.WEBHOOK_SECRET_TOKEN,
	port: config.PORT,
	parts,
});

setupGracefulShutdown(botApp);

await botApp.start();

// Свой id боту нужен, чтобы отличать себя от реальных участников — бот
// тоже пишет в лог сообщений (см. ai-fun/index.ts, ради собственного
// AI-контекста), и без исключения скан дней рождения заносил бы бота в
// "участники" (см. parts/birthdays/scan.ts).
const botId = String(botApp.bot.botInfo?.id ?? "0");

startMessageCleanupCron(botApp.repos.messages, botApp.logger);
startBirthdayScanCron(botApp.repos, botApp.logger, botId, botApp.bot.telegram);
startBirthdayCongratsCron(botApp.repos, botApp.bot.telegram, botApp.logger);

// Админка живёт в том же процессе и на том же порту — /webhook и /health
// уже заняты createBotApp, всё остальное (сессии + API + статика)
// навешивается поверх того же Express-приложения.
await mountAdmin(botApp.app, botApp.repos, botApp.logger, botApp.bot.telegram, botId);
botApp.logger.info("Admin panel mounted");
