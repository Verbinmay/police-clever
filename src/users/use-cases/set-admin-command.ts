import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { BotRepository } from '../../bot/bot.repository';
import { BotService } from '../../bot/bot.service';
import { Chat } from '../../chats/chat.entity';
import { ChatsRepository } from '../../chats/chats.repository';
import { makerResponse } from '../../shared/utils/makerResponse';
import { UsersService } from '../users.service';

export class SetAdminCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(SetAdminCommand)
export class SetAdminCase implements ICommandHandler<SetAdminCommand> {
  private readonly logger = new Logger(SetAdminCase.name);

  constructor(
    private readonly botRepository: BotRepository,
    private readonly botService: BotService,
    private readonly chatsRepository: ChatsRepository,
    private readonly usersService: UsersService,
  ) {}

  async execute(command: SetAdminCommand) {
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
      const nickname: string = this.botService.findAddedTextInMessage(message);

      //Проверка админы назначают админов
      if (!this.usersService.checkRightsAdminsOnly(userId, chat)) {
        throw new Error('User is not admin or owner');
      }

      await this.getAdminRights(chatId, repliedUserId, nickname);

      await this.botRepository.sendMessage(
        chatId,
        'Пользователь успешно назначен важным ебалом в чате',
        message.message_thread_id,
      );

      //Добавление в админы
      await this.usersService.addChatAdmin(chat, repliedUserId);
      await this.usersService.changeNicknameInUserEntity(
        repliedUserId,
        nickname,
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

  private async getAdminRights(
    chatId: number,
    repliedUserId: number,
    nickname: string,
  ) {
    const result: boolean = await this.botRepository.setAdmin(
      chatId,
      repliedUserId,
      nickname,
    );
    if (!result) {
      throw new Error('Failed to set admin');
    }
  }
}
