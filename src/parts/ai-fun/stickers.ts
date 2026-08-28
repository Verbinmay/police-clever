import type { Telegram } from "telegraf";
import type { Logger } from "../../logger/logger.ts";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 час — пак редактируется руками, обновление не обязано быть мгновенным

interface StickerCache {
	setName: string;
	fileIds: string[];
	fetchedAt: number;
}

let cache: StickerCache | null = null;

/**
 * Случайный file_id из стикерпака (фолбэк на триггер-слово, когда лимит
 * исчерпан — см. index.ts). Кэшируется на CACHE_TTL_MS, чтобы не дёргать
 * getStickerSet на каждое сообщение, но переживает добавление/удаление
 * стикеров в пак без рестарта бота — пользователь предупредил, что будет
 * обновлять пак время от времени.
 */
export async function getRandomStickerFileId(telegram: Telegram, setName: string, logger: Logger): Promise<string | null> {
	if (!setName) return null;

	if (!cache || cache.setName !== setName || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
		try {
			const set = await telegram.getStickerSet(setName);
			cache = { setName, fileIds: set.stickers.map((s) => s.file_id), fetchedAt: Date.now() };
		} catch (err) {
			logger.error("Failed to fetch sticker set", { setName }, err);
			return null;
		}
	}

	if (cache.fileIds.length === 0) return null;
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return cache.fileIds[Math.floor(Math.random() * cache.fileIds.length)]!;
}
