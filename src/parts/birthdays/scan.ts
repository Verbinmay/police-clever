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
// Ограничения на размер промпта — тумблер теперь на весь чат (см.
// Chat.birthdaysEnabled), а не на тему, так что в один скан может попасть
// куда больше разных людей сразу (десяток форум-тем одного чата) — режем
// не по темам, а по общему числу участников на чат за проход.
const MAX_USERS_PER_BATCH = 40;
const MAX_CHARS_PER_USER = 300;

const API_KEYS: Record<ProviderId, string> = {
	deepseek: appConfig.DEEPSEEK_API_KEY,
	openai: appConfig.OPENAI_API_KEY,
};

interface ScanEntry {
	tgId: string;
	firstName: string;
	username: string | null;
	lines: string[];
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

function buildPrompt(entries: ScanEntry[]): { system: string; user: string; keyByTgId: Map<string, string> } {
	const keyByTgId = new Map<string, string>();
	const blocks: string[] = [];
	entries.forEach((entry, index) => {
		const key = `u${index + 1}`;
		keyByTgId.set(key, entry.tgId);
		const label = `${key}: имя="${entry.firstName}"${entry.username ? `, username="${entry.username}"` : ""}`;
		const text = entry.lines.join(" / ");
		blocks.push(`${label}\nСообщения: ${text}`);
	});

	const system =
		"Ты анализируешь сообщения из чата, чтобы определить пол и дату рождения каждого участника — СТРОГО по тому, что явно написано в сообщениях (свои же слова о себе, поздравления от других, упоминание возраста с датой и т.п.). Ничего не выдумывай и не угадывай наугад.\n\n" +
		'Для пола: смотри на грамматический род глаголов/прилагательных о себе ("я устала" — female, "я устал" — male) или явное упоминание. Если признаков нет — null.\n\n' +
		'Для даты рождения: только если в сообщениях ЯВНО названа дата (например "у меня др 14 марта", "мне будет 25 числа в мае", "с днюхой, Вася, 5.09!"). Переводи в формат "ДД.ММ" (без года). Если даты нет или она неоднозначна — null.\n\n' +
		"Ответь СТРОГО валидным JSON без пояснений, без markdown-разметки, в виде объекта: {\"u1\": {\"gender\": \"male\"|\"female\"|null, \"birthday\": \"ДД.ММ\"|null}, \"u2\": {...}, ...} — по одному ключу на каждого участника из списка ниже, даже если оба поля null.";

	const user = blocks.join("\n\n");
	return { system, user, keyByTgId };
}

/**
 * Один проход по всем ЧАТАМ с включённым тумблером birthdaysEnabled (см.
 * Chat.birthdaysEnabled — он на весь чат, не на тему): группирует сообщения
 * по автору сразу по всем темам чата, спрашивает AI пол/дату рождения по
 * тексту, пишет через upsertAuto (который сам не трогает birthday, заданный
 * админом — см. birthdays-repository.ts). Раз в 48ч (см.
 * startBirthdayScanCron в index.ts) либо по кнопке "Сканировать сейчас" в
 * панели (POST /api/birthdays/scan).
 */
export async function runBirthdayScan(repos: Repositories, logger: Logger): Promise<void> {
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
			await scanOneChat(repos, client, aiConfig.provider, aiConfig.providers[aiConfig.provider], chat, since, logger);
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
): Promise<void> {
	const messages = await repos.messages.findSinceInChat(chat.chatId, since);
	if (messages.length === 0) return;

	const byUser = new Map<string, ScanEntry>();
	for (const message of messages) {
		let entry = byUser.get(message.tgId);
		if (!entry) {
			entry = { tgId: message.tgId, firstName: message.fromName ?? "аноним", username: null, lines: [] };
			byUser.set(message.tgId, entry);
		}
		const used = entry.lines.join(" ").length;
		if (used < MAX_CHARS_PER_USER) entry.lines.push(message.text.slice(0, 200));
	}

	// username в Message не хранится (только денормализованное отображаемое
	// имя) — добираем из глобального реестра пользователей, если есть.
	const users = await repos.users.listAll();
	const usernameByTgId = new Map(users.map((user) => [user.tgId, user.username]));
	for (const entry of byUser.values()) entry.username = usernameByTgId.get(entry.tgId) ?? null;

	// Первые MAX_USERS_PER_BATCH встреченных (по времени первого сообщения
	// в окне) — при большом чате остальные попадут в следующий проход через
	// 48ч, не теряются насовсем, просто не все сразу.
	const entries = Array.from(byUser.values()).slice(0, MAX_USERS_PER_BATCH);
	if (entries.length === 0) return;

	const { system, user, keyByTgId } = buildPrompt(entries);
	const reply = await client.getReply(system, user, logger, 1500, { stripQuotes: false });
	if (!reply) {
		logger.warn("Скан дней рождения: AI не ответил", { chatId: chat.chatId });
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

	for (const [key, value] of Object.entries(parsed)) {
		const tgId = keyByTgId.get(key);
		const entry = tgId ? byUser.get(tgId) : undefined;
		if (!tgId || !entry) continue;

		await repos.birthdays.upsertAuto({
			tgId,
			firstName: entry.firstName,
			username: entry.username,
			chatId: chat.chatId,
			threadId: "0",
			gender: toGender(value?.gender),
			birthday: toBirthday(value?.birthday),
		});
	}
}
