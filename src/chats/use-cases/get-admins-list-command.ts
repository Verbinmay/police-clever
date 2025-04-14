import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { BotRepository } from '../../bot/bot.repository';
import { makerResponse } from '../../shared/utils/makerResponse';
import { Chat } from '../chat.entity';
import { ChatsRepository } from '../chats.repository';

export class GetAdminsListCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(GetAdminsListCommand)
export class GetAdminsListCase
  implements ICommandHandler<GetAdminsListCommand>
{
  private readonly logger = new Logger(GetAdminsListCase.name);

  constructor(
    private readonly chatsRepository: ChatsRepository,
    private readonly botRepository: BotRepository,
  ) {}

  async execute(command: GetAdminsListCommand) {
    try {
      const { message } = command;
      const chatId: number = message.chat_id;

      //Поиск админов
      const chat: Chat = await this.findChat(chatId);

      const messageText = await this.makeTextAdminsList(
        chat.adminsIds,
        chat.ownerId,
      );

      //Отправка сообщения
      await this.botRepository.sendMessage(
        chatId,
        messageText,
        message.message_thread_id,
      );
      return makerResponse(1);
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

  private async makeTextAdminsList(adminsIds: string[], ownerId: string) {
    let usersFullInfoText: string = 'ADMINS\n';
    for (const userId of [...adminsIds, ownerId]) {
      const user: Td.user | null = await this.botRepository.getUserById(
        Number(userId),
      );
      if (!user) {
        continue;
      }
      usersFullInfoText += `${user.id} - ${user.usernames?.active_usernames[0] ?? 'нет ника'} - ${user.first_name}\n`;
    }
    return usersFullInfoText;
  }
}
