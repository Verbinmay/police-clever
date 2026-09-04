import { Router } from "express";
import type { Repositories } from "../../bot-part.ts";
import type { Logger } from "../../logger/logger.ts";
import { loadBirthdaysConfig, saveBirthdaysConfig } from "../../parts/birthdays/config.ts";
import type { BirthdaysConfig } from "../../parts/birthdays/default-config.ts";
import { runBirthdayScan } from "../../parts/birthdays/scan.ts";

const BIRTHDAY_RE = /^\d{2}\.\d{2}$/;

/**
 * Таблица дней рождения (список + ручная правка даты + удаление) и промпт
 * поздравления (BirthdaysConfig) — оба по прямому требованию выведены в
 * панель. Сам скан — фоновый крон (parts/birthdays/cron.ts, раз в 48ч), тут
 * ещё и ручной запуск (POST /scan) — иначе после первого включения
 * тумблера в "Подчаты" пришлось бы ждать до 48 часов, чтобы увидеть
 * результат.
 */
export function createBirthdaysRouter(repos: Repositories, logger: Logger): Router {
	const { birthdays, settings } = repos;
	const router = Router();

	router.get("/", async (_req, res) => {
		res.json(await birthdays.listAll());
	});

	// Регистрируются ДО "/:tgId" — иначе express подставит tgId="config" и
	// эти запросы никогда не дойдут (маршруты матчатся по порядку регистрации).
	router.get("/config", async (_req, res) => {
		res.json(await loadBirthdaysConfig(settings));
	});

	router.put("/config", async (req, res) => {
		const patch = req.body as Partial<BirthdaysConfig>;
		const current = await loadBirthdaysConfig(settings);
		const next: BirthdaysConfig = { ...current, ...patch };
		await saveBirthdaysConfig(settings, next);
		res.json(next);
	});

	/** Ручной запуск скана прямо сейчас (не дожидаясь 48ч) — синхронно, чтобы панель могла показать "готово"/ошибку сразу. */
	router.post("/scan", async (_req, res) => {
		try {
			await runBirthdayScan(repos, logger);
			res.json({ ok: true });
		} catch (err) {
			logger.error("Ручной запуск скана дней рождения не удался", {}, err);
			res.status(500).json({ error: "Скан не удался — см. логи" });
		}
	});

	/** Ручная правка даты — ставит source="admin", после этого автоскан это поле больше не трогает (см. birthdays-repository.ts). Пустая строка — снять дату. */
	router.put("/:tgId", async (req, res) => {
		const { tgId } = req.params;
		if (!tgId) {
			res.status(400).json({ error: "tgId обязателен" });
			return;
		}
		const { birthday } = req.body as { birthday?: string };
		const value = (birthday ?? "").trim();
		if (value && !BIRTHDAY_RE.test(value)) {
			res.status(400).json({ error: 'Дата должна быть в формате "ДД.ММ" или пустой' });
			return;
		}

		const updated = await birthdays.setAdminBirthday(tgId, value || null);
		if (!updated) {
			res.status(404).json({ error: "Не найден" });
			return;
		}
		res.json(updated);
	});

	/** Человек вышел из чата — убрать из списка. */
	router.delete("/:tgId", async (req, res) => {
		const { tgId } = req.params;
		if (!tgId) {
			res.status(400).json({ error: "tgId обязателен" });
			return;
		}
		await birthdays.delete(tgId);
		res.json({ ok: true });
	});

	return router;
}
