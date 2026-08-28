import env from "env-var";

/**
 * Единый конфиг бота. Идиома (env-var, плоский список) — как в bots-platform
 * (`.../bots-platform/src/config.ts`): общие переменные плоско сверху,
 * ничего специфичного для "частей" пока не требуется — их всего две
 * (ai-fun, mute-vote), и обе настраиваются не через env, а через
 * PartSetting из админки (см. src/db/entities/PartSetting.ts) — редактируются
 * без передеплоя.
 */
export const config = {
	BOT_TOKEN: env.get("BOT_TOKEN").required().asString(),
	DATABASE_URL: env.get("DATABASE_URL").required().asString(),

	/** Публичный базовый URL, на который Telegram шлёт вебхуки, например https://example.com */
	WEBHOOK_BASE_URL: env.get("WEBHOOK_BASE_URL").required().asString(),
	/** Путь вебхука, один на весь бот. */
	WEBHOOK_PATH: env.get("WEBHOOK_PATH").default("/webhook").asString(),
	/**
	 * Значение заголовка X-Telegram-Bot-Api-Secret-Token — без него вебхук
	 * принимает любой POST без проверки, что запрос реально от Telegram.
	 */
	WEBHOOK_SECRET_TOKEN: env.get("WEBHOOK_SECRET_TOKEN").required().asString(),
	PORT: env.get("PORT").default(3000).asPortNumber(),

	// Первый суперадмин-аккаунт панели создаётся из этих переменных при
	// пустой таблице admin_accounts — дальше аккаунты управляются из самой
	// панели (можно добавлять/удалять/менять пароль без правки env).
	ADMIN_BOOTSTRAP_USERNAME: env.get("ADMIN_BOOTSTRAP_USERNAME").required().asString(),
	ADMIN_BOOTSTRAP_PASSWORD: env.get("ADMIN_BOOTSTRAP_PASSWORD").required().asString(),
	/** Секрет для подписи сессионной cookie панели. */
	SESSION_SECRET: env.get("SESSION_SECRET").required().asString(),

	LOG_RETENTION_DAYS: env.get("LOG_RETENTION_DAYS").default(30).asIntPositive(),

	// Оба AI-провайдера — опциональные ключи (не .required()): какой из них
	// реально используется, выбирается в панели (AiConfig.provider, см.
	// src/parts/ai-fun/providers.ts) без передеплоя. Можно держать оба ключа
	// заполненными и переключаться туда-обратно одним селектом в админке.
	DEEPSEEK_API_KEY: env.get("DEEPSEEK_API_KEY").default("").asString(),
	OPENAI_API_KEY: env.get("OPENAI_API_KEY").default("").asString(),
};
