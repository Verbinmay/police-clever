import { mountAdmin } from "./admin/mount.ts";
import { config } from "./config.ts";
import { createBotApp, setupGracefulShutdown } from "./create-bot-app.ts";
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

startMessageCleanupCron(botApp.repos.messages, botApp.logger);

// Админка живёт в том же процессе и на том же порту — /webhook и /health
// уже заняты createBotApp, всё остальное (сессии + API + статика)
// навешивается поверх того же Express-приложения.
await mountAdmin(botApp.app, botApp.repos, botApp.logger);
botApp.logger.info("Admin panel mounted");
