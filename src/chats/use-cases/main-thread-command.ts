import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { BotRepository } from '../../bot/bot.repository';
import { makerResponse } from '../../shared/utils/makerResponse';
import { Chat } from '../chat.entity';
import { ChatsRepository } from '../chats.repository';

export class MainThreadCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(MainThreadCommand)
export class MainThreadCase implements ICommandHandler<MainThreadCommand> {
  private readonly logger = new Logger(MainThreadCase.name);

  constructor(
    private readonly botRepository: BotRepository,
    private readonly chatsRepository: ChatsRepository,
  ) {}

  async execute(command: MainThreadCommand) {
    try {
      const { message } = command;
      const chatId: number = message.chat_id;
      const userId: number = (message.sender_id as Td.messageSenderUser)
        .user_id;
      const chat: Chat = await this.findChat(chatId);
      if (Number(chat.ownerId) !== userId) throw new Error('Not owner');
      const threadId = message.message_thread_id;

      chat.mainThreadId = threadId.toString();
      await this.chatsRepository.save(chat);

      await this.botRepository.sendMessage(
        chatId,
        `Топик для основного чата установлен на этот`,
        threadId,
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
}
