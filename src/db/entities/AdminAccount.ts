import { EntitySchema } from "typeorm";

/**
 * Суперадмин-аккаунт веб-панели. В отличие от bots-platform (один
 * захардкоженный логин/пароль в env), здесь их может быть несколько —
 * пользователь явно просил "возможность добавлять админам аккаунты". Все
 * аккаунты равноправны (полный доступ) — ролей/скоупов по чатам нет.
 * Первый аккаунт сеется из ADMIN_BOOTSTRAP_USERNAME/PASSWORD при пустой
 * таблице (см. src/admin/bootstrap.ts), дальше управляется из панели.
 */
export interface AdminAccount {
	id: string;
	username: string;
	passwordHash: string;
	createdAt: Date;
}

export const AdminAccountSchema = new EntitySchema<AdminAccount>({
	name: "AdminAccount",
	tableName: "admin_accounts",
	columns: {
		id: { type: "uuid", primary: true, generated: "uuid" },
		username: { type: "text", unique: true },
		passwordHash: { type: "text", name: "password_hash" },
		createdAt: { type: "timestamptz", name: "created_at", createDate: true },
	},
});
