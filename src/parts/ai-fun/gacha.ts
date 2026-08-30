import type { SettingsRepository } from "../../db/repositories/settings-repository.ts";
import type { AiConfig } from "./default-config.ts";

const PART_ID = "ai";
const COUNTER_KEY = "gacha:global";

/** Доля пути от counter до gachaGuaranteedAt (0-1) — тиры кривой заданы в долях, а не в абсолютном счётчике, см. GachaRange. */
function probabilityForCounter(curve: AiConfig["gachaCurve"], counter: number, guaranteedAt: number): number {
	const fraction = guaranteedAt > 0 ? counter / guaranteedAt : 1;
	const range = curve.find((r) => fraction <= r.upToFraction);
	return (range ?? curve[curve.length - 1])?.probability ?? 0;
}

/**
 * Персистентный (переживает рестарт процесса) счётчик пассивной гачи —
 * ОДИН НА ВЕСЬ БОТ, а не на чат/тему (было так раньше — независимые
 * счётчики на каждый включённый чат по сути размножали общую частоту
 * пассивных срабатываний пропорционально числу чатов: 5 чатов с AI-
 * шутками означали 5 параллельных гонок к тому же "гарантированному"
 * порогу). Единый счётчик считает подряд идущие сообщения по ВСЕМ чатам/
 * темам с aiJokesEnabled вместе — сработает там, где как раз пришло
 * сообщение, продвинувшее общий счётчик до победы. Итоговую частоту
 * ответов всё равно дожимает чат-wide кулдаун (см. cooldown.ts), но сам
 * "розыгрыш" тоже должен быть один на всех, а не по счётчику на каждый чат.
 */
export async function rollGacha(settings: SettingsRepository, config: AiConfig): Promise<boolean> {
	const counter = await settings.get<number>(PART_ID, COUNTER_KEY, 1);

	if (counter >= config.gachaGuaranteedAt) {
		await settings.set(PART_ID, COUNTER_KEY, 1);
		return true;
	}

	const probability = probabilityForCounter(config.gachaCurve, counter, config.gachaGuaranteedAt);
	if (Math.random() < probability) {
		await settings.set(PART_ID, COUNTER_KEY, 1);
		return true;
	}

	await settings.set(PART_ID, COUNTER_KEY, counter + 1);
	return false;
}

/** Текущее значение общего счётчика гачи, без побочных эффектов — для отображения в панели (не крутит саму гачу). */
export async function peekGachaCounter(settings: SettingsRepository): Promise<number> {
	return settings.get<number>(PART_ID, COUNTER_KEY, 1);
}

/** Ручная правка счётчика из панели — ускорить или отодвинуть гарантированный ответ, не дожидаясь реальных сообщений. Минимум 1 (0 и отрицательные не имеют смысла — счётчик всегда "с какого сообщения считаем"). */
export async function setGachaCounter(settings: SettingsRepository, value: number): Promise<void> {
	await settings.set(PART_ID, COUNTER_KEY, Math.max(1, Math.floor(value)));
}
