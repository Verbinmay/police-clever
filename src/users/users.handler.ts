import type * as Td from 'tdlib-types';

import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';

import { commandsBotMessages } from '../bot/constants/commands';
import { partsOfCommands } from '../bot/constants/partsOfCommands';
import { AddBioCommand } from './use-cases/add-bio-command';
import { AddBirthdayCommand } from './use-cases/add-birthday-command';
import { GetBirthdayCommand } from './use-cases/get-birthday-command';
import { GetMemberInfoCommand } from './use-cases/get-member-info-command';
import { GetMembersCommand } from './use-cases/get-members-command';
import { GetMembersFullCommand } from './use-cases/get-members-full-command';
import { MuteCommand } from './use-cases/mute-command';
import { SetAdminCommand } from './use-cases/set-admin-command';
import { SetNicknameCommand } from './use-cases/set-nickname-command';
import { SetNormisCommand } from './use-cases/set-normis-command';
import { UnmuteCommand } from './use-cases/unmute-command';

@Injectable()
export class UsersHandler {
  constructor(private readonly commandBus: CommandBus) {}

  @OnEvent(partsOfCommands.setAdmin)
  async handleSetAdmin(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new SetAdminCommand(message));
  }

  @OnEvent(partsOfCommands.setName)
  async handleSetNickname(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new SetNicknameCommand(message));
  }

  @OnEvent(commandsBotMessages.setNormis)
  async handleSetNormis(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new SetNormisCommand(message));
  }

  @OnEvent(partsOfCommands.mute)
  async handleMute(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new MuteCommand(message));
  }

  @OnEvent(partsOfCommands.addBio)
  async handleAddBio(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new AddBioCommand(message));
  }

  @OnEvent(partsOfCommands.addBirthday)
  async handleAddBirthday(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new AddBirthdayCommand(message));
  }

  @OnEvent(commandsBotMessages.unmute)
  async handleUnmute(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new UnmuteCommand(message));
  }

  @OnEvent(commandsBotMessages.getMembers)
  async handleGetMembers(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new GetMembersCommand(message));
  }

  @OnEvent(partsOfCommands.getInfo)
  async handleGetInfo(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new GetMemberInfoCommand(message));
  }

  @OnEvent(commandsBotMessages.getBirthdays)
  @Cron('0 8 * * *') // Каждый день в 8:00
  async cronBirthday() {
    await this.commandBus.execute(new GetBirthdayCommand());
  }

  @Cron('0 7 * * *') // Каждый день в 7:00
  async cronGetMembersFull() {
    await this.commandBus.execute(new GetMembersFullCommand());
  }
}
