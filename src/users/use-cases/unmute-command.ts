import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { BotRepository } from '../../bot/bot.repository';
import { Chat } from '../../chats/chat.entity';
import { ChatsRepository } from '../../chats/chats.repository';
import { makerResponse } from '../../shared/utils/makerResponse';
import { MuteInfo } from '../interfaces/mute-info.interface';
import { UsersRepository } from '../users.repository';
import { UsersService } from '../users.service';

export class UnmuteCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(UnmuteCommand)
export class UnmuteCase implements ICommandHandler<UnmuteCommand> {
  private readonly logger = new Logger(UnmuteCase.name);

  constructor(
    private readonly botRepository: BotRepository,
    private readonly chatsRepository: ChatsRepository,
    private readonly usersService: UsersService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async execute(command: UnmuteCommand) {
    try {
      const { message } = command;
      const chatId: number = message.chat_id;
      const userId: number = (message.sender_id as Td.messageSenderUser)
        .user_id;

      //Проверка, что чат существует в базе
      const chat: Chat = await this.findChat(chatId);

      //Проверка, что юзер для анмьюта есть
      const repliedUserId: number = await this.findRepliedUserId(
        message,
        chatId,
      );
      //Проверка, что юзер анмьютят админы
      if (!this.usersService.checkRightsAdminsOnly(userId, chat)) {
        throw new Error('User is not admin or owner');
      }

      await this.unmute(chatId, repliedUserId);

      await this.botRepository.sendMessage(
        chatId,
        `Пользователю повезло, он снова может писать в чат`,
        message.message_thread_id,
      );

      await this.restoreRights(chatId, repliedUserId, chat.adminsIds);

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

  private async unmute(chatId: number, repliedUserId: number) {
    const result: boolean = await this.botRepository.unmuteUser(
      chatId,
      repliedUserId,
    );
    if (!result) {
      throw new Error('Failed to unmute user');
    }
  }

  private async restoreRights(
    chatId: number,
    repliedUserId: number,
    adminsIds: string[],
  ) {
    const user = await this.usersRepository.findByUserId(
      repliedUserId.toString(),
    );
    if (user?.nickname) {
      const muteInfo: MuteInfo = {
        userId: repliedUserId,
        nickname: user.nickname,
        chatId,
        isAdmin: adminsIds.includes(repliedUserId.toString()),
      };
      await this.usersService.restoreUserRights(muteInfo);
    }
  }
}
