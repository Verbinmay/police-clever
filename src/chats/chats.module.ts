import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BotModule } from '../bot/bot.module';
import { ChatDB } from '../db/entities/chatDB.entity';
import { ChatsHandler } from './chats.handler';
import { ChatsRepository } from './chats.repository';
import { CreateChatCase } from './use-cases/create-chat-command';
import { GetAdminsListCase } from './use-cases/get-admins-list-command';
import { MainThreadCase } from './use-cases/main-thread-command';

const useCases = [CreateChatCase, GetAdminsListCase, MainThreadCase];

@Module({
  imports: [TypeOrmModule.forFeature([ChatDB]), CqrsModule, BotModule],
  providers: [ChatsHandler, ChatsRepository, ...useCases],
  exports: [ChatsRepository],
})
export class ChatsModule {}
