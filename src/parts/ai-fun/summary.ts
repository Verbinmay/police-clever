import type { MessagesRepository } from "../../db/repositories/messages-repository.ts";
import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import type { Logger } from "../../logger/logger.ts";
import type { AiClient } from "./ai-client.ts";
import type { AiConfig } from "./default-config.ts";

const PART_ID = "ai";

function summaryKey(chatId: string, threadId: string): string {
	return `summary:${chatId}:${threadId}`;
}
function counterKey(chatId: string, threadId: string): string {
	return `summaryCounter:${chatId}:${threadId}`;
}

// Итерация 1: просили просто "атмосферу" — модель уходила в общие фразы
// вроде "шутят и подкалывают друг друга" без единой зацепки. Итерация 2:
// потребовали конкретику по КАЖДОМУ участнику — перегнули в другую
// сторону, получился построчный пересказ с цитатой чуть ли не на каждого
// (ровно то, что "не пересказ по пунктам" и просило избежать). Баланс:
// 1-2 ярких конкретных детали на всю сводку, а не инвентаризация всех
// говоривших — этого достаточно, чтобы сводка не была пустой, но она
// не должна пытаться охватить каждого по очереди.
const SUMMARY_PROMPT =
	"Сожми переписку в сводку атмосферы чата — общее ощущение разговора, не построчный пересказ и не попытка упомянуть каждого участника по очереди. Не уходи в пустые общие фразы вроде 'шутят и подкалывают друг друга' — вместо этого возьми 1-2 самых ярких, характерных момента разговора и опиши через них общий тон (кто задаёт настроение, какая тема). Если кто-то заметно обращался к боту или реагировал на его слова — можешь упомянуть, но не обязательно. Если среди деталей была необычная или тревожная новость — не сглаживай её в нейтральную фразу, если решишь включить. Только сама сводка, 2-4 предложения, без вступлений.";

/** Используется вместо SUMMARY_PROMPT, когда config.summary.cumulative включён и есть что обновлять — старая сводка идёт первой строкой во входном тексте. */
const SUMMARY_PROMPT_CUMULATIVE =
	"Вот предыдущая сводка атмосферы чата и новые сообщения после неё. Обнови сводку: сохрани то, что всё ещё актуально, замени устаревшее свежим. Общее ощущение разговора, не построчный пересказ и не попытка упомянуть каждого участника по очереди — 1-2 ярких характерных момента достаточно, не больше. Если кто-то заметно обращался к боту или реагировал на его слова — можешь упомянуть, но не обязательно. Необычную или тревожную деталь не сглаживай, если решишь включить. Только сама обновлённая сводка, 2-4 предложения, без вступлений.";

/**
 * Режем НАЧАЛО текста, а не конец — иначе при превышении лимита срезалось
 * бы то, что модель написала последним (обычно как раз более свежие/
 * актуальные детали), а в сводке оставалось начало, которое к моменту
 * следующего обновления уже не так важно. Ищем границу предложения в
 * первых ~30% отрезаемого хвоста, чтобы не начинать сводку с середины
 * фразы; если границы нет — просто добавляем "…" перед хвостом.
 */
function truncateAtSentence(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	const tail = text.slice(text.length - maxChars);
	const candidates = [tail.indexOf(". "), tail.indexOf("! "), tail.indexOf("? ")].filter((i) => i !== -1 && i < maxChars * 0.3);
	if (candidates.length > 0) {
		const cut = Math.min(...candidates) + 2;
		return `…${tail.slice(cut)}`;
	}
	return `…${tail}`;
}

/** Текущая сохранённая сводка темы (null, если ещё ни разу не собиралась). На (chatId, threadId), не только chatId — иначе разные темы одного чата делили бы одну сводку. */
export async function getSummary(settings: SettingsRepository, chatId: string, threadId: string): Promise<string | null> {
	return settings.get<string | null>(PART_ID, summaryKey(chatId, threadId), null);
}

/**
 * Раз в config.summary.everyNMessages сообщений темы — дешёвым отдельным
 * вызовом (свой, урезанный maxTokens) пересобирает "сводку атмосферы"
 * последнего окна сообщений и сохраняет её в PartSetting. Это даёт AI-
 * шуткам ощущение "памяти" о чате почти бесплатно даже при кратном росте
 * активности — каждая отдельная шутка использует уже готовую короткую
 * сводку вместо того, чтобы каждый раз заново вчитываться в длинную
 * историю.
 *
 * Вызывается на каждое сообщение темы с включённым aiJokesEnabled — сам
 * решает, пора ли обновляться, по счётчику. Не блокирует основной путь
 * шутки: ошибка тут не должна ронять обработку сообщения.
 */
export async function maybeUpdateSummary(
	aiClient: AiClient,
	messagesRepo: MessagesRepository,
	settings: SettingsRepository,
	chatId: string,
	threadId: string,
	config: AiConfig,
	logger: Logger,
): Promise<void> {
	try {
		const counter = await settings.get<number>(PART_ID, counterKey(chatId, threadId), 0);
		const next = counter + 1;

		if (next < config.summary.everyNMessages) {
			await settings.set(PART_ID, counterKey(chatId, threadId), next);
			return;
		}

		const rows = await messagesRepo.findLastNInThread(chatId, threadId, config.summary.lookbackMessages);
		const dialogText = rows.map((m) => `${m.fromName ?? "аноним"}: ${m.text}`).join("\n");
		if (!dialogText) {
			await settings.set(PART_ID, counterKey(chatId, threadId), 0);
			return;
		}

		// Накопительный режим: старая сводка идёт первой частью входа, модель
		// её обновляет, а не пишет с нуля. Если сводки ещё не было (первое
		// обновление темы) — вести себя как в обычном режиме, подмешивать нечего.
		let prompt = SUMMARY_PROMPT;
		let input = dialogText;
		if (config.summary.cumulative) {
			const previous = await getSummary(settings, chatId, threadId);
			if (previous) {
				prompt = SUMMARY_PROMPT_CUMULATIVE;
				input = `Предыдущая сводка: ${previous}\n\nНовые сообщения:\n${dialogText}`;
			}
		}

		const reply = await aiClient.getReply(prompt, input, logger, config.summary.maxTokens);
		await settings.set(PART_ID, counterKey(chatId, threadId), 0);
		if (!reply) {
			logger.warn("Summary refresh produced no reply", { chatId, threadId });
			return;
		}

		const text = truncateAtSentence(reply.text, config.summary.maxChars);
		await settings.set(PART_ID, summaryKey(chatId, threadId), text);
		logger.info("Summary refreshed", { chatId, threadId, chars: text.length });
	} catch (err) {
		logger.error("Failed to refresh summary", { chatId, threadId }, err);
	}
}
