import type * as Td from 'tdlib-types';

import { Controller } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';

import { commandsBotMessages } from '../bot/constants/commands';
import { tdcConstants } from '../bot/constants/tdcConstants';
import { DeleteMessageCommand } from './use-cases/delete-message-command';
import { SaveMessageCommand } from './use-cases/save-message-command';

@Controller('messages')
export class MessagesHandler {
  constructor(private readonly commandBus: CommandBus) {}

  @OnEvent(tdcConstants.messageText)
  async handleSaveMessage(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new SaveMessageCommand(message));
  }

  @OnEvent(commandsBotMessages.deleteMessages)
  @Cron('0 * * * *') // Каждый час
  async cronDeleteOldMessagesFromHistory() {
    await this.commandBus.execute(new DeleteMessageCommand());
  }
}
