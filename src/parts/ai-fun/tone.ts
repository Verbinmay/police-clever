import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import type { AiConfig, Tone } from "./default-config.ts";

const PART_ID = "ai";

function pickRandom<T>(items: T[]): T | undefined {
	if (items.length === 0) return undefined;
	return items[Math.floor(Math.random() * items.length)];
}

/** Взвешенный случайный выбор категории тона (веса не обязаны суммироваться в 1). */
function pickTone(weights: Record<Tone, number>): Tone {
	const entries = Object.entries(weights) as Array<[Tone, number]>;
	const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
	if (total <= 0) return "general";

	let roll = Math.random() * total;
	for (const [tone, weight] of entries) {
		roll -= Math.max(0, weight);
		if (roll <= 0) return tone;
	}
	return "general";
}

function usageKey(tone: Tone): string {
	return `scenarioUsage:${tone}`;
}

/**
 * Раньше сценарий внутри тона выбирался чистым random — на практике это
 * давало заметные "везучие" повторы одного и того же сценария подряд
 * (обычный эффект равномерного распределения на короткой дистанции, не
 * баг, но выглядело как баг). Теперь — персистентный счётчик
 * использований на каждый сценарий (ключ: сам текст сценария; тон
 * держит свои сценарии в отдельном ключе). Выбор — случайный, но ТОЛЬКО
 * среди сценариев с минимальным счётчиком в своём тоне: после каждого
 * прохода все сценарии тона сравняются по счётчику, разброс использований
 * внутри тона никогда не превышает 1. Это shuffle-bag, а не чистый
 * random — специально жертвуем "естественной" случайностью ради
 * равномерности, которую и просили.
 *
 * Ключ — сам текст сценария, не индекс: сценарии редактируются в коде
 * между сессиями, при правке формулировки счётчик этого конкретного
 * варианта просто начинается заново — это ожидаемо, не баг.
 */
async function pickLeastUsedScenario(settings: SettingsRepository, tone: Tone, list: string[]): Promise<string | undefined> {
	if (list.length === 0) return undefined;

	const usage = await settings.get<Record<string, number>>(PART_ID, usageKey(tone), {});
	let minCount = Infinity;
	for (const scenario of list) {
		const count = usage[scenario] ?? 0;
		if (count < minCount) minCount = count;
	}

	const candidates = list.filter((scenario) => (usage[scenario] ?? 0) === minCount);
	const picked = pickRandom(candidates);
	if (!picked) return undefined;

	usage[picked] = (usage[picked] ?? 0) + 1;
	await settings.set(PART_ID, usageKey(tone), usage);
	return picked;
}

export interface PickedAction {
	tone: Tone;
	/** Итоговый текст сценария, {target} уже подставлен (если был и если нашлась цель). */
	action: string;
}

/**
 * Выбирает категорию тона и конкретный сценарий внутри неё. Для
 * targeted/sarcasm/praise пытается подставить случайного "активного"
 * участника — если участников нет (пустой список), откатывается на
 * general, чтобы не отправить шутку с плейсхолдером "{target}" в тексте.
 *
 * preferredTarget — для триггера по имени: тот, кто позвал бота. Раньше
 * {target} всегда выбирался случайно из последних 20 активных, и ответ
 * получался раздвоенным — "по существу" привязан к тому, кто написал, а
 * сама шутка сценария могла достаться совсем другому человеку. 70% —
 * подставляем именно позвавшего, 30% оставляем случайность (чтобы не
 * потерять элемент "непонятно, на кого прилетит").
 */
export async function pickAction(settings: SettingsRepository, config: AiConfig, activeParticipants: string[], preferredTarget?: string): Promise<PickedAction> {
	let tone = pickTone(config.toneWeights);

	if (tone !== "general" && activeParticipants.length === 0) {
		tone = "general";
	}

	const list = config.actionsByTone[tone];
	const template = (await pickLeastUsedScenario(settings, tone, list)) ?? (await pickLeastUsedScenario(settings, "general", config.actionsByTone.general)) ?? "Пошути на тему разговора";

	if (!template.includes("{target}")) {
		return { tone, action: template };
	}

	const target = preferredTarget && Math.random() < 0.7 ? preferredTarget : pickRandom(activeParticipants);
	if (!target) {
		// Не должно случиться (проверили выше), но на всякий случай не шлём "{target}" в промпт как есть.
		const fallback = (await pickLeastUsedScenario(settings, "general", config.actionsByTone.general)) ?? "Пошути на тему разговора";
		return { tone: "general", action: fallback };
	}

	return { tone, action: template.replaceAll("{target}", target) };
}
