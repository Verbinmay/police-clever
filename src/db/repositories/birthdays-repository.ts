import type { DataSource } from "typeorm";
import { type Birthday, type Gender, BirthdaySchema } from "../entities/Birthday.ts";

export interface AutoScanInput {
	tgId: string;
	firstName: string;
	username: string | null;
	chatId: string;
	threadId: string;
	/** undefined — скан не смог определить, оставить как было; null — явный сигнал "не определить", тоже пишем (лучше "-", чем зависшее старое значение). */
	gender?: Gender;
	birthday?: string | null;
}

export class BirthdaysRepository {
	constructor(private readonly dataSource: DataSource) {}

	private get repo() {
		return this.dataSource.getRepository(BirthdaySchema);
	}

	async listAll(): Promise<Birthday[]> {
		return this.repo.find({ order: { updatedAt: "DESC" } });
	}

	async get(tgId: string): Promise<Birthday | null> {
		return this.repo.findOneBy({ tgId });
	}

	/**
	 * Пишет результат автоскана (см. parts/birthdays/scan.ts). Ключевое
	 * правило по прямому требованию: если день рождения уже проставлен
	 * админом (`source: "admin"`), автоскан НИКОГДА не трогает поле
	 * `birthday` — только обновляет имя/юзернейм/чат-тему активности (это
	 * не "чьё-то решение", это просто актуальные факты профиля). Пол
	 * автоскан обновляет всегда, если разглядел — это не то поле, которое
	 * админ вручную защищает по условию задачи.
	 */
	async upsertAuto(input: AutoScanInput): Promise<void> {
		const existing = await this.repo.findOneBy({ tgId: input.tgId });

		if (!existing) {
			await this.repo.save(
				this.repo.create({
					tgId: input.tgId,
					firstName: input.firstName,
					username: input.username,
					gender: input.gender ?? null,
					birthday: input.birthday ?? null,
					source: input.birthday ? "auto" : null,
					chatId: input.chatId,
					threadId: input.threadId,
				}),
			);
			return;
		}

		existing.firstName = input.firstName;
		existing.username = input.username;
		existing.chatId = input.chatId;
		existing.threadId = input.threadId;
		if (input.gender !== undefined) existing.gender = input.gender;

		if (existing.source !== "admin" && input.birthday !== undefined) {
			existing.birthday = input.birthday;
			if (input.birthday) existing.source = "auto";
		}

		await this.repo.save(existing);
	}

	/** Ручная правка в панели — ставит source="admin", после этого автоскан поле birthday больше не трогает. */
	async setAdminBirthday(tgId: string, birthday: string | null): Promise<Birthday | null> {
		const existing = await this.repo.findOneBy({ tgId });
		if (!existing) return null;
		existing.birthday = birthday;
		existing.source = birthday ? "admin" : null;
		return this.repo.save(existing);
	}

	/** Человек вышел из чата и т.п. — ручное удаление из панели. */
	async delete(tgId: string): Promise<void> {
		await this.repo.delete({ tgId });
	}

	/** Для ежедневной задачи поздравлений — сравнение по "ДД.ММ", год не хранится. */
	async findByBirthdayDay(dayMonth: string): Promise<Birthday[]> {
		return this.repo.findBy({ birthday: dayMonth });
	}
}
