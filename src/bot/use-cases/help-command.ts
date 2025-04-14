import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { makerResponse } from '../../shared/utils/makerResponse';
import { BotRepository } from '../bot.repository';
import { commandsBotMessages } from '../constants/commands';
import { partsOfCommands } from '../constants/partsOfCommands';

export class HelpCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(HelpCommand)
export class HelpCase implements ICommandHandler<HelpCommand> {
  private readonly logger = new Logger(HelpCase.name);
  private readonly keysOfCommands: string[] = Object.keys({
    ...partsOfCommands,
    ...commandsBotMessages,
  });
  private readonly description = {
    help: 'все: список команд (help)',
    getInfo: 'все: получить информацию о пользователе |(getInfo ник)',
    addBio: 'все: добавить описание |(addBio описание)',
    addBirthday:
      'все: добавить дату рождения |(addBirthday 22.12.2023 или 22.12 или null) - на реплай',
    getAdminsList: 'все: получить список админов |(getAdminsList)',
    setName: 'все: добавить подпись |(setName имя) - на реплай',
    setNormis: 'все: сделать обычным |(setNormis) - на реплай',
    setAdmin: 'админы: сделать админом |(setAdmin имя) - на реплай',
    mute: 'админы: мьют в минутах |(mute 5) - на реплай',
    unmute: 'админы: анмьют |(unmute) - на реплай',
    createChat: 'owner: создать чат |(запрещено)',
    getMembers: 'owner: получить список участников |(запрещено)',
    deleteMessages: 'owner: удалить сообщения за 3 часа |(запрещено)',
    getBirthdays: 'все: получить список дней рождения |(getBirthdays)',
  };

  constructor(private readonly botRepository: BotRepository) {
    if (this.keysOfCommands.length !== Object.keys(this.description).length) {
      throw new Error(`Количество команд не совпадает с количеством описаний`);
    }
  }

  async execute(command: HelpCommand) {
    try {
      const { message } = command;
      const chatId: number = message.chat_id;

      const answer = this.createAnswerText(this.description);

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

  createAnswerText(description: object) {
    let answer = `COMMANDS - через слэш \n`;
    for (const [key, value] of Object.entries(description)) {
      answer += `${key} - ${value} \n`;
    }
    return answer;
  }
}
