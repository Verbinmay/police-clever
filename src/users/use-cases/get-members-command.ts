import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { BotRepository } from '../../bot/bot.repository';
import { Chat } from '../../chats/chat.entity';
import { ChatsRepository } from '../../chats/chats.repository';
import { makerResponse } from '../../shared/utils/makerResponse';
import { UsersService } from '../users.service';

export class GetMembersCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(GetMembersCommand)
export class GetMembersCase implements ICommandHandler<GetMembersCommand> {
  private readonly logger = new Logger(GetMembersCase.name);

  constructor(
    private readonly chatsRepository: ChatsRepository,
    private readonly botRepository: BotRepository,
    private readonly usersService: UsersService,
  ) {}

  async execute(command: GetMembersCommand) {
    try {
      const { message } = command;
      const chatId: number = message.chat_id;
      const userId: number = (message.sender_id as Td.messageSenderUser)
        .user_id;

      //Проверка, что владелец запросил команду и что это не личный чат
      const chat: Chat = await this.findChat(chatId);

      if (!chat || chat.ownerId !== userId.toString()) {
        throw new Error('User is not owner');
      }
      const members: Td.chatMember[] = await this.findMembersList(chatId);

      for (const member of members) {
        await this.usersService.createUser(member, chatId);
      }

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

  private async findMembersList(chatId: number) {
    const members: Array<Td.chatMember> =
      await this.botRepository.findAllMembers(chatId);
    if (!members) {
      throw new Error('Members not found');
    }
    return members;
  }
}
