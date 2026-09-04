import type { Telegram } from "telegraf";
import { config as appConfig } from "../../config.ts";
import type { Repositories } from "../../bot-part.ts";
import type { Gender } from "../../db/entities/Birthday.ts";
import type { Logger } from "../../logger/logger.ts";
import { createAiClient } from "../ai-fun/ai-client.ts";
import { estimateCostUsd } from "../ai-fun/budget.ts";
import { loadAiConfig } from "../ai-fun/config.ts";
import { apiKeyEnvVar, type ProviderId } from "../ai-fun/providers.ts";
import { loadBirthdaysConfig } from "./config.ts";

export const CONGRATS_CHECK_INTERVAL_MS = 60 * 60 * 1000; // проверяем раз в час — этого достаточно, чтобы не проскочить нужный час
const PART_ID = "birthdays";
const SENT_LOG_KEY = "congratsSentOn"; // { [tgId]: "YYYY-MM-DD" } — защита от повторного поздравления при перезапуске в тот же день
// По прямому требованию — поздравление должно уходить примерно в 12 дня по
// Москве, а не в случайный момент часа, когда просто совпал тик крона.
const CONGRATS_HOUR_MOSCOW = 12;

const API_KEYS: Record<ProviderId, string> = {
	deepseek: appConfig.DEEPSEEK_API_KEY,
	openai: appConfig.OPENAI_API_KEY,
};

const GENDER_LABEL: Record<NonNullable<Gender> | "unknown", string> = {
	male: "мужской",
	female: "женский",
	unknown: "неизвестен",
};

/** "ДД.ММ", "YYYY-MM-DD" и текущий час в московском времени — время сервера (VPS) не обязательно совпадает с часовым поясом чата. */
function nowInMoscow(): { dayMonth: string; isoDate: string; hour: number } {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Moscow",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		hour12: false,
	}).formatToParts(new Date());
	const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
	const year = get("year");
	const month = get("month");
	const day = get("day");
	// "24" вместо "00" в некоторых Intl-реализациях в полночь — нормализуем.
	const hour = Number(get("hour")) % 24;
	return { dayMonth: `${day}.${month}`, isoDate: `${year}-${month}-${day}`, hour };
}

/**
 * Один AI-вызов на текст поздравления — общий для настоящей ежедневной
 * рассылки (runBirthdayCongratulations) и тестовой кнопки "Тест" в панели
 * (generateTestCongrats, см. ниже): та же генерация, только вызывающая
 * сторона решает, отправлять ли результат в чат. usageChatId — куда
 * записать в AiUsage (реальный chatId для настоящей отправки, "test" для
 * превью из панели — реальный AI-вызов и его стоимость происходят в обоих
 * случаях, статистика не должна быть слепа к тестам).
 */
async function generateCongratsMessage(repos: Repositories, logger: Logger, firstName: string, gender: Gender, usageChatId: string): Promise<string | null> {
	const aiConfig = await loadAiConfig(repos.settings);
	const apiKey = API_KEYS[aiConfig.provider];
	if (!apiKey) {
		logger.error(`Поздравление не сгенерировано — ${apiKeyEnvVar(aiConfig.provider)} не задан`, { provider: aiConfig.provider });
		return null;
	}
	const client = createAiClient(aiConfig.providers[aiConfig.provider], apiKey, aiConfig.provider);
	const birthdaysConfig = await loadBirthdaysConfig(repos.settings);

	const genderLabel = GENDER_LABEL[gender ?? "unknown"];
	const prompt = birthdaysConfig.congratsPromptTemplate.replace("{name}", firstName).replace("{gender}", genderLabel);
	const userContent = `Сегодня день рождения у ${firstName}.`;

	const reply = await client.getReply(prompt, userContent, logger, 300);
	if (!reply) {
		logger.warn("Не удалось сгенерировать поздравление", { firstName });
		return null;
	}

	const costUsd = estimateCostUsd(reply.promptTokens, reply.completionTokens, aiConfig.providers[aiConfig.provider]);
	await repos.aiUsage.record({
		chatId: usageChatId,
		threadId: "0",
		kind: "birthday-congrats",
		provider: aiConfig.provider,
		promptText: prompt,
		userContent,
		replyText: reply.text,
		promptTokens: reply.promptTokens,
		completionTokens: reply.completionTokens,
		costUsd,
	});

	return reply.text;
}

/**
 * Раз в час (см. CONGRATS_CHECK_INTERVAL_MS) проверяет, у кого сегодня день
 * рождения (по московскому времени), и шлёт AI-сгенерированное поздравление
 * в общий чат — но только в час CONGRATS_HOUR_MOSCOW (12 дня), не в любой
 * случайный тик почасового крона. Промпт поздравления — BirthdaysConfig,
 * редактируется в панели.
 */
export async function runBirthdayCongratulations(repos: Repositories, telegram: Telegram, logger: Logger): Promise<void> {
	const { dayMonth, isoDate, hour } = nowInMoscow();
	if (hour !== CONGRATS_HOUR_MOSCOW) return;

	const birthdays = await repos.birthdays.findByBirthdayDay(dayMonth);
	if (birthdays.length === 0) return;

	const sentLog = await repos.settings.get<Record<string, string>>(PART_ID, SENT_LOG_KEY, {});
	const pending = birthdays.filter((birthday) => sentLog[birthday.tgId] !== isoDate);
	if (pending.length === 0) return;

	for (const birthday of pending) {
		try {
			const text = await generateCongratsMessage(repos, logger, birthday.firstName, birthday.gender, birthday.chatId);
			if (!text) continue;

			// По прямому требованию — поздравление адресуется конкретному
			// человеку упоминанием по id (text_mention работает даже без
			// username, в отличие от @username-упоминания, и реально пингует
			// человека, как обычный @-меншн) — а не просто безадресным
			// текстом в чат. По прямому требованию — всегда в ОБЩИЙ чат, не в
			// конкретную форум-тему, даже если человека чаще видели в
			// какой-то отдельной теме (threadId в записи — чисто справочный).
			const mentionLabel = birthday.firstName;
			await telegram.sendMessage(birthday.chatId, `${mentionLabel}, ${text}`, {
				entities: [{ type: "text_mention", offset: 0, length: mentionLabel.length, user: { id: Number(birthday.tgId), is_bot: false, first_name: birthday.firstName } }],
			});

			sentLog[birthday.tgId] = isoDate;
			logger.info("Поздравление с днём рождения отправлено", { tgId: birthday.tgId, chatId: birthday.chatId });
		} catch (err) {
			logger.error("Ошибка при отправке поздравления", { tgId: birthday.tgId }, err);
		}
	}

	await repos.settings.set(PART_ID, SENT_LOG_KEY, sentLog);
}

/**
 * Кнопка "Тест" в панели — генерирует текст поздравления по текущему
 * промпту для конкретного человека, но НЕ отправляет его в чат (и не
 * трогает "уже поздравили сегодня" — реальный день рождения этим не
 * помечается как отработанный). Реальный AI-вызов, расходует бюджет как
 * обычно, только без sendMessage.
 */
export async function generateTestCongrats(repos: Repositories, logger: Logger, firstName: string, gender: Gender): Promise<string | null> {
	return generateCongratsMessage(repos, logger, firstName, gender, "test");
}
