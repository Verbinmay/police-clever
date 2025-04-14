import type * as Td from 'tdlib-types';

import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { OnEvent } from '@nestjs/event-emitter';

import { commandsBotMessages } from './constants/commands';
import { commandsBotWords } from './constants/words';
import { HelpCommand } from './use-cases/help-command';
import { YesNoCommand } from './use-cases/yes-no-command';

@Injectable()
export class BotHandler {
  constructor(private readonly commandBus: CommandBus) {}

  @OnEvent([`/${commandsBotWords.yes}`, `/${commandsBotWords.no}`])
  async handleSetAdmin(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new YesNoCommand(message));
  }

  @OnEvent(commandsBotMessages.help)
  async handleHelp(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new HelpCommand(message));
  }
}
