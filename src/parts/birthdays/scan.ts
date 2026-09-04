import type { Telegram } from "telegraf";
import type { Repositories } from "../../bot-part.ts";
import type { Chat } from "../../db/entities/Chat.ts";
import type { Logger } from "../../logger/logger.ts";

export const SCAN_INTERVAL_MS = 48 * 60 * 60 * 1000; // раз в двое суток, по прямому требованию
const PART_ID = "birthdays";
const LAST_SCAN_KEY = "lastScanAt";
// Тумблер на весь чат (см. Chat.birthdaysEnabled), а не на тему — в один
// проход может попасть много разных людей сразу.
const MAX_USERS_PER_BATCH = 60;

interface ProfileEntry {
	tgId: string;
	firstName: string;
	username: string | null;
	/**
	 * "ДД.ММ" из СТРУКТУРИРОВАННОГО поля Telegram-профиля "Дата рождения"
	 * (getChat → birthdate: {day,month,year}) — пользователь заполняет его
	 * через настройки Telegram явно как дату, это не текст для угадывания.
	 * По прямому требованию — единственный источник даты, никакого AI:
	 * либо Telegram отдаёт точную дату, либо мы честно пишем "не найдено".
	 * Пол Telegram структурированно не отдаёт вообще — это чисто ручное
	 * поле в панели (см. birthdays-repository.ts setAdminGender), автоскан
	 * его никак не трогает и не пытается угадать.
	 */
	birthdate: string | null;
}

// telegraf 4.16.3 (текущая зависимость) ещё не типизирует "birthdate" — это
// поле Bot API добавлен позже версии, под которую написаны эти typings.
// Сам API его реально отдаёт (проверено вживую curl'ом на getChat), просто
// без официального типа — расширяем структурно сами, без `any`.
interface ChatFullInfoWithBirthdate {
	birthdate?: { day: number; month: number; year?: number };
}

/** birthdate доступен боту через getChat даже для участников группы, с которыми не было личной переписки — но это не гарантировано (настройки приватности пользователя), поэтому тихо пропускаем сбой на конкретном человеке, не роняя весь скан. */
async function fetchProfile(telegram: Telegram, tgId: string, fallbackName: string, logger: Logger): Promise<ProfileEntry> {
	try {
		const chatInfo = await telegram.getChat(Number(tgId));
		const firstName = "first_name" in chatInfo && chatInfo.first_name ? chatInfo.first_name : fallbackName;
		const username = "username" in chatInfo ? (chatInfo.username ?? null) : null;
		const birthdateField = (chatInfo as unknown as ChatFullInfoWithBirthdate).birthdate;
		const birthdate = birthdateField ? `${String(birthdateField.day).padStart(2, "0")}.${String(birthdateField.month).padStart(2, "0")}` : null;
		return { tgId, firstName, username, birthdate };
	} catch (err) {
		logger.debug("Не удалось получить профиль участника (обычно из-за настроек приватности) — пропускаем", { tgId, err: String(err) });
		return { tgId, firstName: fallbackName, username: null, birthdate: null };
	}
}

/**
 * Один проход по всем ЧАТАМ с включённым тумблером birthdaysEnabled (см.
 * Chat.birthdaysEnabled — он на весь чат, не на тему). По прямому
 * требованию — НИКАКОГО AI в этой части вообще: дата рождения читается
 * напрямую из структурированного поля профиля Telegram (getChat →
 * birthdate), пол Telegram не отдаёт и потому только ручной (см. панель).
 * Локальный лог сообщений (messages) используется исключительно чтобы
 * узнать САМ СПИСОК участников чата (кто вообще тут писал) — их текст при
 * этом никуда не передаётся и не читается. Пишет через upsertAuto (который
 * сам не трогает поля, заданные админом — см. birthdays-repository.ts).
 * Раз в 48ч (см. startBirthdayScanCron в index.ts) либо по кнопке
 * "Обновить сейчас" в панели (POST /api/birthdays/scan).
 */
export async function runBirthdayScan(repos: Repositories, logger: Logger, botId: string, telegram: Telegram): Promise<void> {
	const chats = await repos.chats.listAll();
	const scanChats = chats.filter((chat) => chat.birthdaysEnabled);
	if (scanChats.length === 0) return;

	const lastScanAtRaw = await repos.settings.get<string | null>(PART_ID, LAST_SCAN_KEY, null);
	const since = lastScanAtRaw ? new Date(lastScanAtRaw) : new Date(Date.now() - SCAN_INTERVAL_MS);

	for (const chat of scanChats) {
		try {
			await scanOneChat(repos, chat, since, logger, botId, telegram);
		} catch (err) {
			logger.error("Ошибка обновления профилей дней рождения по чату", { chatId: chat.chatId }, err);
		}
	}

	await repos.settings.set(PART_ID, LAST_SCAN_KEY, new Date().toISOString());
	logger.info("Обновление дней рождения завершено", { chats: scanChats.length });
}

async function scanOneChat(repos: Repositories, chat: Chat, since: Date, logger: Logger, botId: string, telegram: Telegram): Promise<void> {
	// Только чтобы узнать, КТО писал в чате — сам текст сообщений ниже
	// нигде не используется и не передаётся никуда, только tgId/имя-по-умолчанию.
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

	for (const tgId of tgIds) {
		// Последовательно, не Promise.all — не заваливаем Bot API
		// параллельным потоком getChat на пару десятков человек разом.
		// eslint-disable-next-line no-await-in-loop
		const profile = await fetchProfile(telegram, tgId, fallbackNameByTgId.get(tgId) ?? "аноним", logger);
		// eslint-disable-next-line no-await-in-loop
		await repos.birthdays.upsertAuto({
			tgId: profile.tgId,
			firstName: profile.firstName,
			username: profile.username,
			chatId: chat.chatId,
			threadId: "0",
			// birthdate уже null, если Telegram его не отдал — пишем явно
			// (не undefined), чтобы честно проставить "не найдено", как и
			// просили изначально. upsertAuto сам не тронет значение, если
			// его раньше задал админ вручную.
			birthday: profile.birthdate,
		});
	}
}
