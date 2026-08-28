import type { Context } from "telegraf";

/**
 * Общий тип контекста бота. В отличие от bots-platform, здесь не нужны
 * Scenes/Wizard (не было ни одной части с многошаговым диалогом) —
 * обычный telegraf Context хватает.
 */
export type BotContext = Context;
