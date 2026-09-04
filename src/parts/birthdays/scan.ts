import type { Telegram } from "telegraf";
import { config as appConfig } from "../../config.ts";
import type { Repositories } from "../../bot-part.ts";
import type { Chat } from "../../db/entities/Chat.ts";
import type { Gender } from "../../db/entities/Birthday.ts";
import type { Logger } from "../../logger/logger.ts";
import { createAiClient } from "../ai-fun/ai-client.ts";
import { estimateCostUsd } from "../ai-fun/budget.ts";
import { loadAiConfig } from "../ai-fun/config.ts";
import { apiKeyEnvVar, type ProviderId } from "../ai-fun/providers.ts";

export const SCAN_INTERVAL_MS = 48 * 60 * 60 * 1000; // раз в двое суток, по прямому требованию
const PART_ID = "birthdays";
const LAST_SCAN_KEY = "lastScanAt";
// Тумблер на весь чат (см. Chat.birthdaysEnabled), а не на тему — в один
// проход может попасть много разных людей сразу.
const MAX_USERS_PER_BATCH = 60;

const API_KEYS: Record<ProviderId, string> = {
	deepseek: appConfig.DEEPSEEK_API_KEY,
	openai: appConfig.OPENAI_API_KEY,
};

interface ProfileEntry {
	tgId: string;
	firstName: string;
	username: string | null;
	bio: string | null;
}

interface ScanResultValue {
	gender?: "male" | "female" | null;
	birthday?: string | null;
}

function toGender(value: unknown): Gender | undefined {
	if (value === "male" || value === "female") return value;
	if (value === null) return null;
	return undefined;
}

/** "ДД.ММ" со строгой проверкой диапазона — не доверяем модели вслепую, мусор в дате хуже, чем "не нашли". */
function toBirthday(value: unknown): string | null | undefined {
	if (value === null) return null;
	if (typeof value !== "string") return undefined;
	const match = /^(\d{2})\.(\d{2})$/.exec(value.trim());
	if (!match) return undefined;
	const day = Number(match[1]);
	const month = Number(match[2]);
	if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
	return match[0];
}

function buildPrompt(entries: ProfileEntry[]): { system: string; user: string; keyByTgId: Map<string, string> } {
	const keyByTgId = new Map<string, string>();
	const blocks: string[] = [];
	entries.forEach((entry, index) => {
		const key = `u${index + 1}`;
		keyByTgId.set(key, entry.tgId);
		blocks.push(`${key}: имя="${entry.firstName}"${entry.username ? `, username="${entry.username}"` : ""}\nbio: ${entry.bio}`);
	});

	const system =
		"Ты определяешь пол и дату рождения людей СТРОГО по их профилю в Telegram (имя, username, bio) — переписку в чате ты не видишь и не должен её учитывать, только то, что дано ниже.\n\n" +
		'Для пола: только если в bio или имени есть явный признак (обращение о себе в женском/мужском роде, эмодзи явно гендерные и т.п.) — иначе null, не угадывай по имени вслепую (имя может быть никнеймом).\n\n' +
		'Для даты рождения: только если в bio ЯВНО указана дата (например "14.03", "14 марта", "род. 05.09"). Знак зодиака (например "Дева ♍") — это НЕ дата, не переводи его в дату. Переводи найденную дату в формат "ДД.ММ" (без года). Ничего не выдумывай — нет явной даты значит null.\n\n' +
		"Ответь СТРОГО валидным JSON без пояснений, без markdown-разметки, в виде объекта: {\"u1\": {\"gender\": \"male\"|\"female\"|null, \"birthday\": \"ДД.ММ\"|null}, \"u2\": {...}, ...} — по одному ключу на каждого человека из списка ниже, даже если оба поля null.";

	const user = blocks.join("\n\n");
	return { system, user, keyByTgId };
}

/** Bio доступен боту через getChat даже для участников группы, с которыми не было личной переписки — но это не гарантировано (настройки приватности пользователя), поэтому тихо пропускаем сбой на конкретном человеке, не роняя весь скан. */
async function fetchProfile(telegram: Telegram, tgId: string, fallbackName: string, logger: Logger): Promise<ProfileEntry> {
	try {
		const chatInfo = await telegram.getChat(Number(tgId));
		const firstName = "first_name" in chatInfo && chatInfo.first_name ? chatInfo.first_name : fallbackName;
		const username = "username" in chatInfo ? (chatInfo.username ?? null) : null;
		const bio = "bio" in chatInfo && chatInfo.bio ? chatInfo.bio.trim() : null;
		return { tgId, firstName, username, bio: bio || null };
	} catch (err) {
		logger.debug("Не удалось получить профиль участника (обычно из-за настроек приватности) — пропускаем", { tgId, err: String(err) });
		return { tgId, firstName: fallbackName, username: null, bio: null };
	}
}

/**
 * Один проход по всем ЧАТАМ с включённым тумблером birthdaysEnabled (см.
 * Chat.birthdaysEnabled — он на весь чат, не на тему). По прямому
 * требованию — источник пола/даты рождения ТОЛЬКО профиль Telegram
 * (имя/username/bio через getChat), переписка не анализируется вообще;
 * локальный лог сообщений (messages) используется исключительно чтобы
 * узнать САМ СПИСОК участников чата (кто вообще тут писал) — их текст при
 * этом никуда не передаётся и не читается. Пишет через upsertAuto (который
 * сам не трогает поля, заданные админом — см. birthdays-repository.ts).
 * Раз в 48ч (см. startBirthdayScanCron в index.ts) либо по кнопке
 * "Сканировать сейчас" в панели (POST /api/birthdays/scan).
 */
export async function runBirthdayScan(repos: Repositories, logger: Logger, botId: string, telegram: Telegram): Promise<void> {
	const chats = await repos.chats.listAll();
	const scanChats = chats.filter((chat) => chat.birthdaysEnabled);
	if (scanChats.length === 0) return;

	const aiConfig = await loadAiConfig(repos.settings);
	const apiKey = API_KEYS[aiConfig.provider];
	if (!apiKey) {
		logger.error(`Скан дней рождения пропущен — ${apiKeyEnvVar(aiConfig.provider)} не задан`, { provider: aiConfig.provider });
		return;
	}
	const client = createAiClient(aiConfig.providers[aiConfig.provider], apiKey, aiConfig.provider);

	const lastScanAtRaw = await repos.settings.get<string | null>(PART_ID, LAST_SCAN_KEY, null);
	const since = lastScanAtRaw ? new Date(lastScanAtRaw) : new Date(Date.now() - SCAN_INTERVAL_MS);

	for (const chat of scanChats) {
		try {
			await scanOneChat(repos, client, aiConfig.provider, aiConfig.providers[aiConfig.provider], chat, since, logger, botId, telegram);
		} catch (err) {
			logger.error("Ошибка скана дней рождения по чату", { chatId: chat.chatId }, err);
		}
	}

	await repos.settings.set(PART_ID, LAST_SCAN_KEY, new Date().toISOString());
	logger.info("Скан дней рождения завершён", { chats: scanChats.length });
}

async function scanOneChat(
	repos: Repositories,
	client: ReturnType<typeof createAiClient>,
	provider: ProviderId,
	providerConfig: Parameters<typeof estimateCostUsd>[2],
	chat: Chat,
	since: Date,
	logger: Logger,
	botId: string,
	telegram: Telegram,
): Promise<void> {
	// Только чтобы узнать, КТО писал в чате — сам текст сообщений ниже
	// нигде не используется и не передаётся AI, только tgId/имя-по-умолчанию.
	const messages = await repos.messages.findSinceInChat(chat.chatId, since);
	if (messages.length === 0) return;

	const fallbackNameByTgId = new Map<string, string>();
	for (const message of messages) {
		// Свои же реплики бот тоже пишет в messages (см. ai-fun/index.ts —
		// нужно для его собственного AI-контекста), но бот — не человек и
		// не именинник, его нельзя заносить в участников.
		if (message.tgId === botId) continue;
		if (!fallbackNameByTgId.has(message.tgId)) fallbackNameByTgId.set(message.tgId, message.fromName ?? "аноним");
	}

	// Первые MAX_USERS_PER_BATCH встреченных — при большом чате остальные
	// попадут в следующий проход через 48ч, не теряются насовсем.
	const tgIds = Array.from(fallbackNameByTgId.keys()).slice(0, MAX_USERS_PER_BATCH);
	if (tgIds.length === 0) return;

	const profiles: ProfileEntry[] = [];
	// Последовательно, не Promise.all — не заваливаем Bot API параллельным
	// потоком getChat на пару десятков человек разом.
	for (const tgId of tgIds) {
		// eslint-disable-next-line no-await-in-loop
		profiles.push(await fetchProfile(telegram, tgId, fallbackNameByTgId.get(tgId) ?? "аноним", logger));
	}

	// Имя/username обновляем всем, у кого получилось узнать профиль — это
	// не требует AI. AI зовём только по тем, у кого реально есть bio: у
	// пустого bio просто нечего анализировать.
	const withBio = profiles.filter((p) => p.bio);
	const withoutBio = profiles.filter((p) => !p.bio);

	for (const profile of withoutBio) {
		await repos.birthdays.upsertAuto({
			tgId: profile.tgId,
			firstName: profile.firstName,
			username: profile.username,
			chatId: chat.chatId,
			threadId: "0",
		});
	}

	if (withBio.length === 0) return;

	const { system, user, keyByTgId } = buildPrompt(withBio);
	const reply = await client.getReply(system, user, logger, 1500, { stripQuotes: false });
	if (!reply) {
		logger.warn("Скан дней рождения: AI не ответил", { chatId: chat.chatId });
		// Профили без AI-анализа bio всё равно обновляем — имя/username это не теряет.
		for (const profile of withBio) {
			await repos.birthdays.upsertAuto({ tgId: profile.tgId, firstName: profile.firstName, username: profile.username, chatId: chat.chatId, threadId: "0" });
		}
		return;
	}

	const costUsd = estimateCostUsd(reply.promptTokens, reply.completionTokens, providerConfig);
	await repos.aiUsage.record({
		chatId: chat.chatId,
		threadId: "0",
		kind: "birthday-scan",
		tone: null,
		provider,
		promptText: system,
		userContent: user,
		replyText: reply.text,
		promptTokens: reply.promptTokens,
		completionTokens: reply.completionTokens,
		costUsd,
	});

	let parsed: Record<string, ScanResultValue>;
	try {
		// Модель иногда оборачивает JSON в ```json ... ``` несмотря на явный
		// запрет — на всякий случай срезаем markdown-ограждение перед парсингом.
		const cleaned = reply.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
		parsed = JSON.parse(cleaned) as Record<string, ScanResultValue>;
	} catch (err) {
		logger.warn("Скан дней рождения: не удалось распарсить ответ AI", { chatId: chat.chatId }, err);
		return;
	}

	const profileByTgId = new Map(withBio.map((p) => [p.tgId, p]));
	for (const [key, value] of Object.entries(parsed)) {
		const tgId = keyByTgId.get(key);
		const profile = tgId ? profileByTgId.get(tgId) : undefined;
		if (!tgId || !profile) continue;

		await repos.birthdays.upsertAuto({
			tgId,
			firstName: profile.firstName,
			username: profile.username,
			chatId: chat.chatId,
			threadId: "0",
			gender: toGender(value?.gender),
			birthday: toBirthday(value?.birthday),
		});
	}
}
