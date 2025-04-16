import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { utilSettings } from '../../bot/constants/utilSettings';
import { makerResponse } from '../../shared/utils/makerResponse';
import { MessagesRepository } from '../messages.repository';

export class DeleteMessageCommand {
  constructor() {}
}

@CommandHandler(DeleteMessageCommand)
export class DeleteMessageCase
  implements ICommandHandler<DeleteMessageCommand>
{
  private readonly logger = new Logger(DeleteMessageCase.name);

  constructor(private readonly messagesRepository: MessagesRepository) {}

  async execute() {
    try {
      await this.messagesRepository.deleteNHoursOldMessages(
        utilSettings.deleteMessagesTimeInHours,
      );
      makerResponse(1);
    } catch (e) {
      this.logger.error(e);
      return makerResponse(0);
    }
  }
}
