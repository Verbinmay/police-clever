import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { APP_SETTINGS } from '../app/settings/app-settings';
import { ChatDB } from './entities/chatDB.entity';
import { MessageDB } from './entities/messageDB.entity';
import { UserDB } from './entities/userDB.entity';

const entities = [ChatDB, UserDB, MessageDB];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>(APP_SETTINGS.POLICE_DB_HOST),
        port: +configService.get<number>(APP_SETTINGS.POLICE_DB_PORT)!,
        username: configService.get<string>(APP_SETTINGS.POLICE_DB_USER),
        password: configService.get<string>(
          APP_SETTINGS.POLICE_DB_PASSWORD,
        ) as string,
        database: configService.get<string>(APP_SETTINGS.POLICE_DB_NAME),
        entities: [...entities],
        autoLoadEntities: true,
        synchronize: true,
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [],
  providers: [],
})
export class DbModule {}
