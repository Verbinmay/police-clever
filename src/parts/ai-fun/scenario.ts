import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import type { AiConfig } from "./default-config.ts";

const PART_ID = "ai";
const USAGE_KEY = "scenarioUsage";

function pickRandom<T>(items: T[]): T | undefined {
	if (items.length === 0) return undefined;
	return items[Math.floor(Math.random() * items.length)];
}

/** Экспортируется для admin-роута статистики (scenario-usage.ts) — та же формула ключа, без дублирования. */
export function usageKey(): string {
	return USAGE_KEY;
}

/**
 * Раньше сценарий выбирался в два шага — сперва категория тона (general/
 * targeted/sarcasm/praise) по весам, затем сценарий внутри неё — по
 * прямому требованию тоны убраны целиком как лишний груз: один общий пул
 * сценариев, один shuffle-bag. Случайный выбор ТОЛЬКО среди сценариев с
 * минимальным счётчиком использований во всём пуле сразу: после каждого
 * прохода все сценарии сравняются по счётчику, разброс использований
 * никогда не превышает 1.
 *
 * Ключ — сам текст сценария, не индекс: сценарии редактируются в панели
 * между сессиями, при правке формулировки счётчик этого конкретного
 * варианта просто начинается заново — это ожидаемо, не баг.
 */
async function pickLeastUsedScenario(settings: SettingsRepository, list: string[]): Promise<string | undefined> {
	if (list.length === 0) return undefined;

	const usage = await settings.get<Record<string, number>>(PART_ID, USAGE_KEY, {});
	let minCount = Infinity;
	for (const scenario of list) {
		const count = usage[scenario] ?? 0;
		if (count < minCount) minCount = count;
	}

	const candidates = list.filter((scenario) => (usage[scenario] ?? 0) === minCount);
	const picked = pickRandom(candidates);
	if (!picked) return undefined;

	usage[picked] = (usage[picked] ?? 0) + 1;
	await settings.set(PART_ID, USAGE_KEY, usage);
	return picked;
}

export interface PickedAction {
	/** Итоговый текст сценария, {target} уже подставлен (если был и если нашлась цель). */
	action: string;
}

/**
 * Выбирает сценарий из общего пула. Сценарии с {target} требуют активного
 * участника (или адресата триггера) — если ни того ни другого нет, такие
 * сценарии заранее (ДО выбора, не после) исключаются из пула, чтобы не
 * отправить шутку с необработанным плейсхолдером в тексте и не задвоить
 * счётчик повторным вызовом pickLeastUsedScenario на "запасном" пуле.
 *
 * preferredTarget — для триггера по имени: тот, кто позвал бота. Раньше
 * {target} всегда выбирался случайно из последних 20 активных, и ответ
 * получался раздвоенным — "по существу" привязан к тому, кто написал, а
 * сама шутка сценария могла достаться совсем другому человеку. Если есть
 * другие активные участники — 70% подставляем именно позвавшего, 30%
 * оставляем случайность; если активных участников нет вообще (только сам
 * позвавший) — используем его всегда, иначе просто нечего подставлять.
 */
export async function pickAction(settings: SettingsRepository, config: AiConfig, activeParticipants: string[], preferredTarget?: string): Promise<PickedAction> {
	const canTarget = activeParticipants.length > 0 || Boolean(preferredTarget);
	const pool = canTarget ? config.actions : config.actions.filter((scenario) => !scenario.includes("{target}"));

	const template = (await pickLeastUsedScenario(settings, pool)) ?? "Пошути на тему разговора";

	if (!template.includes("{target}")) {
		return { action: template };
	}

	const target = activeParticipants.length > 0 ? (preferredTarget && Math.random() < 0.7 ? preferredTarget : pickRandom(activeParticipants)) : preferredTarget;

	// Не должно случиться (canTarget это гарантирует выше), но на всякий случай не шлём "{target}" в промпт как есть.
	if (!target) return { action: template.replaceAll("{target}", "кое-кого") };

	return { action: template.replaceAll("{target}", target) };
}
