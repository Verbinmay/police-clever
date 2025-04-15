import { BotService } from 'src/bot/bot.service';
import type * as Td from 'tdlib-types';

import { format } from '@formkit/tempo';
import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { BotRepository } from '../../bot/bot.repository';
import { Chat } from '../../chats/chat.entity';
import { ChatsRepository } from '../../chats/chats.repository';
import { LastDB } from '../../db/entities/lastDB.entity';
import { LastRepository } from '../../messages/last.repository';
import { makerResponse } from '../../shared/utils/makerResponse';
import { User } from '../users.entity';
import { UsersRepository } from '../users.repository';

export class GetMemberInfoCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(GetMemberInfoCommand)
export class GetMemberInfoCase
  implements ICommandHandler<GetMemberInfoCommand>
{
  private readonly logger = new Logger(GetMemberInfoCase.name);

  constructor(
    private readonly botRepository: BotRepository,
    private readonly botService: BotService,
    private readonly chatsRepository: ChatsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly lastRepository: LastRepository,
  ) {}

  async execute(command: GetMemberInfoCommand) {
    try {
      const { message } = command;
      const chatId: number = message.chat_id;

      //Проверка, что чат существует в базе
      await this.findChat(chatId);

      const { username, user, last } = await this.findUserInfo(message);

      const messageText: string = this.createBioMessage(username, user, last);

      await this.botRepository.sendMessage(
        chatId,
        messageText,
        message.message_thread_id,
      );

      makerResponse(1);
    } catch (e) {
      this.logger.error(e);
      return makerResponse(0);
    }
  }

  private async findChat(chatId: number): Promise<Chat> {
    const chat: Chat | null = await this.chatsRepository.findByChatId(
      chatId.toString(),
    );
    if (!chat) {
      throw new Error('Chat not found');
    }
    return chat;
  }

  private async findUserInfo(message: Td.message) {
    const username: string = this.botService.findAddedTextInMessage(message);

    const user: User | null =
      await this.usersRepository.findByUsername(username);

    const last: LastDB | null = user
      ? await this.lastRepository.findByIdTg(user.idTg)
      : null;

    return { username, user, last };
  }

  private createBioMessage(
    username: string,
    user: User | null,
    last: LastDB | null,
  ) {
    let messageText: string = `${username}\n`;
    if (user?.birthdate) {
      messageText += `День рождения: ${format(user.birthdate, 'long')}\n`;
    }
    if (user?.bio) {
      messageText += `Био: ${user.bio}\n`;
    }
    if (last) {
      messageText += `Последняя активность: ${format(last.date, 'long')}\n`;
    }
    return messageText;
  }
}
