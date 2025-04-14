import type * as Td from 'tdlib-types';

import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { OnEvent } from '@nestjs/event-emitter';

import { commandsBotMessages } from '../bot/constants/commands';
import { CreateChatCommand } from './use-cases/create-chat-command';
import { GetAdminsListCommand } from './use-cases/get-admins-list-command';

@Injectable()
export class ChatsHandler {
  constructor(private readonly commandBus: CommandBus) {}

  @OnEvent(commandsBotMessages.createChat)
  async handleCreateChat(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new CreateChatCommand(message));
  }

  @OnEvent(commandsBotMessages.getAdminsList)
  async handleGetAdminsList(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new GetAdminsListCommand(message));
  }
}
