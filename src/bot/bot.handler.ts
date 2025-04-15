import type * as Td from 'tdlib-types';

import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { OnEvent } from '@nestjs/event-emitter';

import { commandsBotMessages } from './constants/commands';
import { devCommands } from './constants/devCommands';
import { commandsBotWords } from './constants/words';
import { DevEnableCommand } from './use-cases/dev-enable-command';
import { HelpCommand } from './use-cases/help-command';
import { StatusCommand } from './use-cases/status-command';
import { YesNoCommand } from './use-cases/yes-no-command';

@Injectable()
export class BotHandler {
  constructor(private readonly commandBus: CommandBus) {}

  @OnEvent(`/${commandsBotWords.yes}`)
  @OnEvent(`/${commandsBotWords.no}`)
  async handleYesNo(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new YesNoCommand(message));
  }

  @OnEvent(commandsBotMessages.help)
  async handleHelp(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new HelpCommand(message));
  }

  @OnEvent(devCommands.devEnable)
  @OnEvent(devCommands.devDisable)
  async handleEnable(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new DevEnableCommand(message));
  }

  @OnEvent(commandsBotMessages.status)
  async handleStatus(update: Td.updateNewMessage) {
    const message: Td.message = update.message;
    await this.commandBus.execute(new StatusCommand(message));
  }
}
