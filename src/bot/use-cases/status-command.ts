import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { makerResponse } from '../../shared/utils/makerResponse';
import { BotRepository } from '../bot.repository';
import { EventsFilterService } from '../events.filter.service';

export class StatusCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(StatusCommand)
export class StatusCase implements ICommandHandler<StatusCommand> {
  private readonly logger = new Logger(StatusCase.name);

  constructor(
    private readonly botRepository: BotRepository,
    private readonly eventsService: EventsFilterService,
  ) {}

  async execute(command: StatusCommand) {
    try {
      const { message } = command;
      const chatId: number = message.chat_id;

      await this.botRepository.sendMessage(
        chatId,
        `${this.eventsService.getInstanceId()} - ${
          this.eventsService.isInstanceActive() ? '🟢 Active' : '🔴 Inactive'
        } `,
        message.message_thread_id,
      );

      makerResponse(1);
    } catch (e) {
      this.logger.error(e);
      return makerResponse(0);
    }
  }
}
