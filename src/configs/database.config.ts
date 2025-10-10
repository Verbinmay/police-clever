import { get } from "env-var";
import "../libs/utils/dotenv";
import { APP_SETTINGS } from "./app-settings";

type DatabaseConfig = {
	type: "postgres";
	host: string;
	port: number;
	username: string;
	password: string;
	database: string;
};

export const databaseConfig: DatabaseConfig = {
	type: "postgres",
	host: get(APP_SETTINGS.POLICE_DB_HOST).required().asString(),
	port: get(APP_SETTINGS.POLICE_DB_PORT).required().asIntPositive(),
	username: get(APP_SETTINGS.POLICE_DB_USER).required().asString(),
	password: get(APP_SETTINGS.POLICE_DB_PASSWORD).required().asString(),
	database: get(APP_SETTINGS.POLICE_DB_NAME).required().asString(),
};

export const postgresConnectionUri = `postgres://${databaseConfig.username}:${databaseConfig.password}@${databaseConfig.host}/${databaseConfig.database}`;
