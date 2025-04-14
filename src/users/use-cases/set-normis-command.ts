import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { makerResponse } from '../../shared/utils/makerResponse';
import { BotRepository } from '../../bot/bot.repository';
import { Chat } from '../../chats/chat.entity';
import { ChatsRepository } from '../../chats/chats.repository';
import { UsersService } from '../users.service';

export class SetNormisCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(SetNormisCommand)
export class SetNormisCase implements ICommandHandler<SetNormisCommand> {
  private readonly logger = new Logger(SetNormisCase.name);

  constructor(
    private readonly botRepository: BotRepository,
    private readonly chatsRepository: ChatsRepository,
    private readonly usersService: UsersService,
  ) {}

  async execute(command: SetNormisCommand) {
    try {
      const { message } = command;
      const chatId: number = message.chat_id;
      const userId: number = (message.sender_id as Td.messageSenderUser)
        .user_id;

      //Проверка, что чат существует в базе
      const chat: Chat = await this.findChat(chatId);

      //Проверка, что юзер есть
      const repliedUserId: number = await this.findRepliedUserId(
        message,
        chatId,
      );

      //Проверка, что юзер сам себя снижает в правах или админы
      if (
        !this.usersService.checkRightsAdminsOrUser(userId, chat, repliedUserId)
      ) {
        throw new Error('User is not admin or owner');
      }

      await this.makeNormis(chatId, repliedUserId);

      await this.botRepository.sendMessage(
        chatId,
        'Пользователь успешно стал нормисом',
        message.message_thread_id,
      );

      await this.usersService.removeChatAdmin(chat, repliedUserId);
      await this.usersService.changeNicknameInUserEntity(repliedUserId, null);
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

  private async findRepliedUserId(
    message: Td.message,
    chatId: number,
  ): Promise<number> {
    const repliedUserId: number | null =
      await this.usersService.findRepliedUserId(message, chatId);
    if (!repliedUserId) {
      throw new Error('User for nickname not found');
    }
    return repliedUserId;
  }

  private async makeNormis(chatId: number, repliedUserId: number) {
    const result: boolean = await this.botRepository.setNormis(
      chatId,
      repliedUserId,
    );
    if (!result) {
      throw new Error('Failed to set normis');
    }
  }
}
