import { Router } from "express";
import type { Telegram } from "telegraf";
import type { Repositories } from "../../bot-part.ts";
import type { Logger } from "../../logger/logger.ts";
import { loadBirthdaysConfig, saveBirthdaysConfig } from "../../parts/birthdays/config.ts";
import type { BirthdaysConfig } from "../../parts/birthdays/default-config.ts";
import { runBirthdayScan } from "../../parts/birthdays/scan.ts";

const BIRTHDAY_RE = /^\d{2}\.\d{2}$/;

function parseGender(value: unknown): { ok: true; gender: "male" | "female" | null } | { ok: false } {
	if (value === "male" || value === "female" || value === null || value === "") return { ok: true, gender: value || null };
	return { ok: false };
}

/**
 * Таблица дней рождения (список + ручное добавление/удаление + ручная
 * правка пола/даты) и промпт поздравления (BirthdaysConfig) — оба по
 * прямому требованию выведены в панель. Не у всех дата рождения естественно
 * всплывёт в переписке — ручное добавление тут не запасной вариант, а
 * основной путь для таких людей. Сам скан — фоновый крон
 * (parts/birthdays/cron.ts, раз в 48ч), тут ещё и ручной запуск (POST
 * /scan) — иначе после первого включения тумблера в "Подчаты" пришлось бы
 * ждать до 48 часов, чтобы увидеть результат.
 */
export function createBirthdaysRouter(repos: Repositories, logger: Logger, botId: string, telegram: Telegram): Router {
	const { birthdays, settings } = repos;
	const router = Router();

	router.get("/", async (_req, res) => {
		res.json(await birthdays.listAll());
	});

	/** Ручное добавление человека, которого автоскан ещё не видел (или не сможет — например, он не пишет свою дату рождения в чат вслух). */
	router.post("/", async (req, res) => {
		const { tgId, firstName, username, chatId, gender, birthday } = req.body as {
			tgId?: string;
			firstName?: string;
			username?: string;
			chatId?: string;
			gender?: string | null;
			birthday?: string;
		};

		if (!tgId || !/^\d+$/.test(tgId.trim())) {
			res.status(400).json({ error: "tgId обязателен и должен быть числом (Telegram id)" });
			return;
		}
		if (!firstName?.trim()) {
			res.status(400).json({ error: "Имя обязательно" });
			return;
		}
		if (!chatId?.trim()) {
			res.status(400).json({ error: "Чат обязателен" });
			return;
		}
		const genderResult = parseGender(gender ?? null);
		if (!genderResult.ok) {
			res.status(400).json({ error: 'Пол должен быть "male", "female" или пустым' });
			return;
		}
		const birthdayValue = (birthday ?? "").trim();
		if (birthdayValue && !BIRTHDAY_RE.test(birthdayValue)) {
			res.status(400).json({ error: 'Дата должна быть в формате "ДД.ММ" или пустой' });
			return;
		}

		const saved = await birthdays.upsertAdmin({
			tgId: tgId.trim(),
			firstName: firstName.trim(),
			username: username?.trim() || null,
			chatId: chatId.trim(),
			gender: genderResult.gender,
			birthday: birthdayValue || null,
		});
		res.json(saved);
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
			await runBirthdayScan(repos, logger, botId, telegram);
			res.json({ ok: true });
		} catch (err) {
			logger.error("Ручной запуск скана дней рождения не удался", {}, err);
			res.status(500).json({ error: "Скан не удался — см. логи" });
		}
	});

	/**
	 * Ручная правка пола и/или даты существующей записи — оба поля
	 * опциональны в теле запроса (передан только тот, что реально
	 * поменяли), каждое ставит свой source="admin", после чего автоскан то
	 * конкретное поле больше не трогает (см. birthdays-repository.ts).
	 * Пустая строка — снять значение.
	 */
	router.put("/:tgId", async (req, res) => {
		const { tgId } = req.params;
		if (!tgId) {
			res.status(400).json({ error: "tgId обязателен" });
			return;
		}
		const { birthday, gender } = req.body as { birthday?: string; gender?: string | null };

		let updated = null;
		if (birthday !== undefined) {
			const value = birthday.trim();
			if (value && !BIRTHDAY_RE.test(value)) {
				res.status(400).json({ error: 'Дата должна быть в формате "ДД.ММ" или пустой' });
				return;
			}
			updated = await birthdays.setAdminBirthday(tgId, value || null);
			if (!updated) {
				res.status(404).json({ error: "Не найден" });
				return;
			}
		}
		if (gender !== undefined) {
			const genderResult = parseGender(gender);
			if (!genderResult.ok) {
				res.status(400).json({ error: 'Пол должен быть "male", "female" или пустым' });
				return;
			}
			updated = await birthdays.setAdminGender(tgId, genderResult.gender);
			if (!updated) {
				res.status(404).json({ error: "Не найден" });
				return;
			}
		}

		if (!updated) {
			res.status(400).json({ error: "Нужно передать birthday и/или gender" });
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
