import type { DataSource } from "typeorm";
import { type AdminAccount, AdminAccountSchema } from "../entities/AdminAccount.ts";

export class AdminAccountsRepository {
	constructor(private readonly dataSource: DataSource) {}

	private get repo() {
		return this.dataSource.getRepository(AdminAccountSchema);
	}

	async count(): Promise<number> {
		return this.repo.count();
	}

	async create(username: string, passwordHash: string): Promise<AdminAccount> {
		return this.repo.save(this.repo.create({ username, passwordHash }));
	}

	async findByUsername(username: string): Promise<AdminAccount | null> {
		return this.repo.findOneBy({ username });
	}

	async findById(id: string): Promise<AdminAccount | null> {
		return this.repo.findOneBy({ id });
	}

	async listAll(): Promise<AdminAccount[]> {
		return this.repo.find({ order: { createdAt: "ASC" } });
	}

	async delete(id: string): Promise<void> {
		await this.repo.delete({ id });
	}

	async updatePassword(id: string, passwordHash: string): Promise<void> {
		await this.repo.update({ id }, { passwordHash });
	}
}
