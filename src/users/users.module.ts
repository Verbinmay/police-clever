import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BotModule } from '../bot/bot.module';
import { ChatsModule } from '../chats/chats.module';
import { UserDB } from '../db/entities/userDB.entity';
import { MessagesModule } from '../messages/messages.module';
import { AddBioCase } from './use-cases/add-bio-command';
import { AddBirthdayCase } from './use-cases/add-birthday-command';
import { GetBirthdayCase } from './use-cases/get-birthday-command';
import { GetMemberInfoCase } from './use-cases/get-member-info-command';
import { GetMembersCase } from './use-cases/get-members-command';
import { GetMembersFullCase } from './use-cases/get-members-full-command';
import { MuteCase } from './use-cases/mute-command';
import { SetAdminCase } from './use-cases/set-admin-command';
import { SetNicknameCase } from './use-cases/set-nickname-command';
import { SetNormisCase } from './use-cases/set-normis-command';
import { UnmuteCase } from './use-cases/unmute-command';
import { UsersHandler } from './users.handler';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

const useCases = [
  SetNicknameCase,
  SetNormisCase,
  SetAdminCase,
  MuteCase,
  UnmuteCase,
  GetMembersCase,
  AddBioCase,
  AddBirthdayCase,
  GetMemberInfoCase,
  GetBirthdayCase,
  GetMembersFullCase,
];

@Module({
  imports: [
    TypeOrmModule.forFeature([UserDB]),
    CqrsModule,
    BotModule,
    ChatsModule,
    MessagesModule,
  ],
  providers: [UsersRepository, UsersService, UsersHandler, ...useCases],
  exports: [UsersRepository],
})
export class UsersModule {}
