import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { BotRepository } from '../../bot/bot.repository';
import { Chat } from '../../chats/chat.entity';
import { ChatsRepository } from '../../chats/chats.repository';
import { makerResponse } from '../../shared/utils/makerResponse';
import { UsersService } from '../users.service';

export class GetMembersFullCommand {
  constructor() {}
}

@CommandHandler(GetMembersFullCommand)
export class GetMembersFullCase
  implements ICommandHandler<GetMembersFullCommand>
{
  private readonly logger = new Logger(GetMembersFullCase.name);

  constructor(
    private readonly chatsRepository: ChatsRepository,
    private readonly botRepository: BotRepository,
    private readonly usersService: UsersService,
  ) {}

  async execute() {
    try {
      const chats: Chat[] = await this.findChats();
      for (const chatIN of chats) {
        const chatId: number = Number(chatIN.chatId);

        const members: Td.chatMember[] = await this.findMembersList(chatId);

        for (const member of members) {
          await this.usersService.createUser(member, chatId);
        }
      }
      return makerResponse(1);
    } catch (e) {
      this.logger.error(e);
      return makerResponse(0);
    }
  }

  private async findChats(): Promise<Chat[]> {
    const chats: Chat[] = await this.chatsRepository.findAll();
    if (!chats) {
      throw new Error('Chats not found');
    }
    return chats;
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
