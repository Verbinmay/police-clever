import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { BotRepository } from '../../bot/bot.repository';
import { BotService } from '../../bot/bot.service';
import { Chat } from '../../chats/chat.entity';
import { ChatsRepository } from '../../chats/chats.repository';
import { makerResponse } from '../../shared/utils/makerResponse';
import { UsersService } from '../users.service';

export class MuteCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(MuteCommand)
export class MuteCase implements ICommandHandler<MuteCommand> {
  private readonly logger = new Logger(MuteCase.name);

  constructor(
    private readonly botRepository: BotRepository,
    private readonly botService: BotService,
    private readonly chatsRepository: ChatsRepository,
    private readonly usersService: UsersService,
  ) {}

  async execute(command: MuteCommand) {
    try {
      const { message } = command;
      const chatId: number = message.chat_id;
      const userId: number = (message.sender_id as Td.messageSenderUser)
        .user_id;

      //Проверка, что чат существует в базе
      const chat: Chat = await this.findChat(chatId);

      //Проверка, что юзер для мьюта есть в сообщении
      const repliedUserId: number = await this.findRepliedUserId(
        message,
        chatId,
      );
      //Проверка, что юзер сам себе мьют готовит или его ставят на колени админы
      if (
        !this.usersService.checkRightsAdminsOrUser(userId, chat, repliedUserId)
      ) {
        throw new Error('User is not admin or owner');
      }

      const minutes: number = this.getMinutesFromMessage(message);

      await this.mute(chatId, repliedUserId, minutes);

      await this.botRepository.sendMessage(
        chatId,
        `Туда его на ${minutes} мин`,
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

  private getMinutesFromMessage(message: Td.message): number {
    const text: string = this.botService.findAddedTextInMessage(message);
    return isNaN(parseInt(text)) ? 5 : parseInt(text);
  }

  private async mute(chatId: number, repliedUserId: number, minutes: number) {
    const result: boolean = await this.botRepository.muteUser(
      chatId,
      repliedUserId,
      minutes,
    );

    if (!result) {
      throw new Error('Failed to mute user');
    }
  }
}
