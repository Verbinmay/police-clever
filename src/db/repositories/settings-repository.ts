import type { DataSource } from "typeorm";
import { PartSettingSchema } from "../entities/PartSetting.ts";

/** Порт 1:1 из bots-platform (`db/repositories/settings-repository.ts`). */
export class SettingsRepository {
	constructor(private readonly dataSource: DataSource) {}

	private get repo() {
		return this.dataSource.getRepository(PartSettingSchema);
	}

	async get<T>(partId: string, key: string, defaultValue: T): Promise<T> {
		const row = await this.repo.findOneBy({ partId, key });
		return row ? (row.value as T) : defaultValue;
	}

	async set(partId: string, key: string, value: unknown): Promise<void> {
		const existing = await this.repo.findOneBy({ partId, key });
		if (existing) {
			existing.value = value;
			await this.repo.save(existing);
		} else {
			await this.repo.save(this.repo.create({ partId, key, value }));
		}
	}

	async listByPart(partId: string): Promise<Array<{ key: string; value: unknown }>> {
		const rows = await this.repo.findBy({ partId });
		return rows.map((row) => ({ key: row.key, value: row.value }));
	}
}
