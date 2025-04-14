import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { BotRepository } from '../../bot/bot.repository';
import { partsOfCommands } from '../../bot/constants/partsOfCommands';
import { Chat } from '../../chats/chat.entity';
import { ChatsRepository } from '../../chats/chats.repository';
import { makerResponse } from '../../shared/utils/makerResponse';
import { UsersRepository } from '../users.repository';

export class AddBioCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(AddBioCommand)
export class AddBioCase implements ICommandHandler<AddBioCommand> {
  private readonly logger = new Logger(AddBioCase.name);

  constructor(
    private readonly botRepository: BotRepository,
    private readonly chatsRepository: ChatsRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  async execute(command: AddBioCommand) {
    try {
      const { message } = command;
      const chatId: number = message.chat_id;
      const userId: number = (message.sender_id as Td.messageSenderUser)
        .user_id;
      await this.findChat(chatId);
      const text: string = (message.content as Td.messageText).text.text;

      const bio = text.slice(partsOfCommands.addBio.length).trim();
      if (bio.length > 4050) {
        throw new Error('Bio is too long');
      }

      await this.changeBio(userId, bio === 'null' ? null : bio);
      await this.botRepository.sendMessage(
        chatId,
        `Обновил твою шелуху`,
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

  private async changeBio(userId: number, bio: string | null) {
    const result: boolean = await this.usersRepository.patchUserBio(
      userId.toString(),
      bio,
    );

    if (!result) {
      throw new Error('Failed to update user bio');
    }
  }
}
