import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { databaseConfig } from "src/configs/database.config";
import { ChatDB } from "./entities/chatDB.entity";
import { MessageDB } from "./entities/messageDB.entity";
import { UserDB } from "./entities/userDB.entity";

const entities = [ChatDB, UserDB, MessageDB];

@Module({
	imports: [
		TypeOrmModule.forRoot({
			...databaseConfig,
			entities: [...entities],
			autoLoadEntities: true,
			synchronize: true,
		}),
	],
	controllers: [],
	providers: [],
})
export class DbModule {}
