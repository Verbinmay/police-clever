import { BotService } from 'src/bot/bot.service';
import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { BotRepository } from '../../bot/bot.repository';
import { Chat } from '../../chats/chat.entity';
import { ChatsRepository } from '../../chats/chats.repository';
import { makerResponse } from '../../shared/utils/makerResponse';
import { UsersRepository } from '../users.repository';
import { UsersService } from '../users.service';

export class AddBirthdayCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(AddBirthdayCommand)
export class AddBirthdayCase implements ICommandHandler<AddBirthdayCommand> {
  private readonly logger = new Logger(AddBirthdayCase.name);

  constructor(
    private readonly botRepository: BotRepository,

    private readonly botService: BotService,
    private readonly chatsRepository: ChatsRepository,
    private readonly usersService: UsersService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async execute(command: AddBirthdayCommand) {
    try {
      const { message } = command;
      const chatId: number = message.chat_id;
      const userId: number = (message.sender_id as Td.messageSenderUser)
        .user_id;

      const chat: Chat = await this.findChat(chatId);
      const repliedUserId: number = await this.findRepliedUserId(
        message,
        chatId,
      );
      if (
        !this.usersService.checkRightsAdminsOrUser(userId, chat, repliedUserId)
      ) {
        throw new Error('User is not admin or owner');
      }

      const birthdate: Date | null = this.getDateFromMessage(message);

      await this.changeBirthday(repliedUserId, birthdate);
      await this.botRepository.sendMessage(
        chatId,
        `Обновил дату`,
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

  private getDateFromMessage(message: Td.message): Date | null {
    const text: string = this.botService.findAddedTextInMessage(message);
    // text '22.12.2023' | '22.12' | 'null'
    if (text === 'null') {
      return null;
    }

    const dateParts: string[] = text.split('.');
    if (dateParts.length < 2 || dateParts.length > 3) {
      throw new Error('Invalid date format');
    }
    const day: number = parseInt(dateParts[0]);
    const month: number = parseInt(dateParts[1]) - 1; // месяцы начинаются с 0
    const year: number = dateParts.length === 3 ? parseInt(dateParts[2]) : 2024;
    if (isNaN(day) || isNaN(month) || isNaN(year)) {
      throw new Error('Invalid date format');
    }
    if (
      day < 1 ||
      day > 31 ||
      month < 0 ||
      month > 11 ||
      year < 1970 ||
      year > 2024
    ) {
      throw new Error('Invalid date value');
    }

    return new Date(year, month, day);
  }

  private async changeBirthday(userId: number, birthdate: Date | null) {
    const result: boolean = await this.usersRepository.patchUserBirthday(
      userId.toString(),
      birthdate,
    );

    if (!result) {
      throw new Error('Failed to update user bio');
    }
  }
}
