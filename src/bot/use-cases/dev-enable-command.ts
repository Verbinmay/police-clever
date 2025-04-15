import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { APP_SETTINGS } from '../../app/settings/app-settings';
import { makerResponse } from '../../shared/utils/makerResponse';
import { BotRepository } from '../bot.repository';
import { BotService } from '../bot.service';
import { devCommands } from '../constants/devCommands';
import { EventsFilterService } from '../events.filter.service';

export class DevEnableCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(DevEnableCommand)
export class DevEnableCase implements ICommandHandler<DevEnableCommand> {
  private readonly logger = new Logger(DevEnableCase.name);

  constructor(
    private readonly botRepository: BotRepository,
    private readonly botService: BotService,
    private readonly eventsService: EventsFilterService,
    private readonly configService: ConfigService,
  ) {}

  async execute(command: DevEnableCommand) {
    try {
      const { message } = command;
      const chatId: number = message.chat_id;
      const userId: number = (message.sender_id as Td.messageSenderUser)
        .user_id;
      const text = (message.content as Td.messageText).text.text;
      const activate: boolean = text.includes(devCommands.devEnable);

      this.checkRightsDev(userId);

      const extractedAppId: string =
        this.botService.findAddedTextInMessage(message);

      this.checkAppId(extractedAppId);

      if (activate) {
        this.eventsService.activate();
      } else {
        this.eventsService.deactivate();
      }

      await this.botRepository.sendMessage(
        chatId,
        activate ? '🟢 Active' : '🔴 Inactive',
        message.message_thread_id,
      );

      makerResponse(1);
    } catch (e) {
      this.logger.error(e);
      return makerResponse(0);
    }
  }

  private checkRightsDev(userId: number) {
    if (
      userId !==
      Number(this.configService.get<number>(APP_SETTINGS.POLICE_DEVOPS_USER_ID))
    ) {
      throw new Error('User is not devops');
    }
  }
  private checkAppId(extractedAppId: string) {
    const apiId = this.eventsService.getInstanceId();
    if (apiId !== extractedAppId) {
      throw new Error('AppId is not correct');
    }
  }
}
