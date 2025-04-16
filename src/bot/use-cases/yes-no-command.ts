import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { BotRepository } from '../../bot/bot.repository';
import { makerResponse } from '../../shared/utils/makerResponse';
import { commandsBotWords } from '../constants/words';

const yesAnswersArray = [
  'пизда',
  'манда',
  'балда',
  'хуй на',
  'джигурда',
  'елда',
];

const noAnswersArray = [
  'на нет и суда нет',
  'минет',
  'пидора ответ',
  'обосрал тебя дед',
];

export class YesNoCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(YesNoCommand)
export class YesNoCase implements ICommandHandler<YesNoCommand> {
  private readonly logger = new Logger(YesNoCase.name);

  constructor(private readonly botRepository: BotRepository) {}

  async execute(command: YesNoCommand) {
    try {
      const { message } = command;
      const chatId: number = message.chat_id;
      const text: string = (message.content as Td.messageText).text.text;

      if (Math.random() > 0.5) {
        return makerResponse(1);
      }

      const answer = this.createAnswerText(text.toLowerCase());

      await this.botRepository.sendMessage(
        chatId,
        answer,
        message.message_thread_id,
      );

      makerResponse(1);
    } catch (e) {
      this.logger.error(e);
      return makerResponse(0);
    }
  }

  createAnswerText(text: string) {
    let answer = 'Не пон';

    if (text === commandsBotWords.yes) {
      answer =
        yesAnswersArray[Math.floor(Math.random() * yesAnswersArray.length)];
    } else if (text === commandsBotWords.no) {
      answer =
        noAnswersArray[Math.floor(Math.random() * noAnswersArray.length)];
    }

    return answer;
  }
}
