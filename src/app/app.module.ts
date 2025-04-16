import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

import { AiModule } from '../ai/ai.module';
import { BotModule } from '../bot/bot.module';
import { ChatsModule } from '../chats/chats.module';
import { DbModule } from '../db/db.module';
import { MessagesModule } from '../messages/messages.module';
import { UsersModule } from '../users/users.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CqrsModule.forRoot(),
    BotModule,
    UsersModule,
    DbModule,
    MessagesModule,
    AiModule,
    EventEmitterModule.forRoot({
      wildcard: true, // Для обработки событий с wildcard
      delimiter: '.', // Разделитель для namespace
      global: true, // Глобальная регистрация
    }),
    ChatsModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
