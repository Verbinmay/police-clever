import type { AiConfig, Tone } from "./default-config.ts";

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
export function pickAction(config: AiConfig, activeParticipants: string[], preferredTarget?: string): PickedAction {
	let tone = pickTone(config.toneWeights);

	if (tone !== "general" && activeParticipants.length === 0) {
		tone = "general";
	}

	const list = config.actionsByTone[tone];
	const template = pickRandom(list) ?? pickRandom(config.actionsByTone.general) ?? "Пошути на тему разговора";

	if (!template.includes("{target}")) {
		return { tone, action: template };
	}

	const target = preferredTarget && Math.random() < 0.7 ? preferredTarget : pickRandom(activeParticipants);
	if (!target) {
		// Не должно случиться (проверили выше), но на всякий случай не шлём "{target}" в промпт как есть.
		const fallback = pickRandom(config.actionsByTone.general) ?? "Пошути на тему разговора";
		return { tone: "general", action: fallback };
	}

	return { tone, action: template.replaceAll("{target}", target) };
}
