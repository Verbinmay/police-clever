import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatsModule } from '../chats/chats.module';
import { LastDB } from '../db/entities/lastDB.entity';
import { MessageDB } from '../db/entities/messageDB.entity';
import { LastRepository } from './last.repository';
import { MessagesHandler } from './messages.handler';
import { MessagesRepository } from './messages.repository';
import { SaveMessageCase } from './use-cases/save-message-command';

const useCases = [SaveMessageCase];
@Module({
  imports: [
    TypeOrmModule.forFeature([MessageDB, LastDB]),
    CqrsModule,
    ChatsModule,
  ],
  providers: [MessagesRepository, LastRepository, MessagesHandler, ...useCases],
  exports: [MessagesRepository, LastRepository],
})
export class MessagesModule {}
