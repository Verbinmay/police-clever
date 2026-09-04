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

export interface AdminUpsertInput {
	tgId: string;
	firstName: string;
	username: string | null;
	/** Чат, куда пойдёт поздравление — при ручном добавлении выбирается в панели (список чатов с включённым учётом др). */
	chatId: string;
	/** undefined — не менять текущее значение (используется при ручной правке одного поля через PUT /:tgId). */
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
	 * правило по прямому требованию: если день рождения или пол уже
	 * проставлены админом (`source`/`genderSource: "admin"`), автоскан
	 * НИКОГДА их не трогает — только обновляет имя/юзернейм/чат активности
	 * (это не "чьё-то решение", это просто актуальные факты профиля).
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
					genderSource: input.gender ? "auto" : null,
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

		if (existing.genderSource !== "admin" && input.gender !== undefined) {
			existing.gender = input.gender;
			if (input.gender) existing.genderSource = "auto";
		}

		if (existing.source !== "admin" && input.birthday !== undefined) {
			existing.birthday = input.birthday;
			if (input.birthday) existing.source = "auto";
		}

		await this.repo.save(existing);
	}

	/**
	 * Ручное добавление нового человека и/или правка существующего из
	 * панели — одна функция на обе кнопки ("Добавить" и инлайн-правка пола/
	 * даты в таблице). gender/birthday — undefined значит "не трогать это
	 * поле" (используется при точечной правке одного поля через PUT
	 * /:tgId — см. admin/routes/birthdays.ts), а не "сбросить в null" —
	 * для явного сброса нужно передать null.
	 */
	async upsertAdmin(input: AdminUpsertInput): Promise<Birthday> {
		const existing = await this.repo.findOneBy({ tgId: input.tgId });

		if (!existing) {
			return this.repo.save(
				this.repo.create({
					tgId: input.tgId,
					firstName: input.firstName,
					username: input.username,
					chatId: input.chatId,
					threadId: "0",
					gender: input.gender ?? null,
					genderSource: input.gender !== undefined ? "admin" : null,
					birthday: input.birthday ?? null,
					source: input.birthday !== undefined ? "admin" : null,
				}),
			);
		}

		existing.firstName = input.firstName;
		existing.username = input.username;
		existing.chatId = input.chatId;
		if (input.gender !== undefined) {
			existing.gender = input.gender;
			existing.genderSource = input.gender ? "admin" : null;
		}
		if (input.birthday !== undefined) {
			existing.birthday = input.birthday;
			existing.source = input.birthday ? "admin" : null;
		}
		return this.repo.save(existing);
	}

	/** Точечная ручная правка пола существующей записи — ставит genderSource="admin", после этого автоскан поле gender больше не трогает. */
	async setAdminGender(tgId: string, gender: Gender): Promise<Birthday | null> {
		const existing = await this.repo.findOneBy({ tgId });
		if (!existing) return null;
		existing.gender = gender;
		existing.genderSource = gender ? "admin" : null;
		return this.repo.save(existing);
	}

	/** Точечная ручная правка даты существующей записи — ставит source="admin", после этого автоскан поле birthday больше не трогает. */
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
