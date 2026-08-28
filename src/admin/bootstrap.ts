import argon2 from "argon2";
import type { AdminAccountsRepository } from "../db/repositories/admin-accounts-repository.ts";
import type { Logger } from "../logger/logger.ts";

/**
 * Создаёт первый суперадмин-аккаунт из ADMIN_BOOTSTRAP_USERNAME/PASSWORD,
 * если таблица admin_accounts ещё пуста. Дальше аккаунты (несколько,
 * равноправных) управляются из самой панели ("Аккаунты").
 */
export async function bootstrapAdminAccount(accounts: AdminAccountsRepository, username: string, password: string, logger: Logger): Promise<void> {
	const count = await accounts.count();
	if (count > 0) return;

	const passwordHash = await argon2.hash(password);
	await accounts.create(username, passwordHash);
	logger.info("Bootstrapped first admin account", { username });
}
