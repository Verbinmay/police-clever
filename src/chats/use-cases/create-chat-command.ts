import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { BotRepository } from '../../bot/bot.repository';
import { ChatsRepository } from '../../chats/chats.repository';
import { makerResponse } from '../../shared/utils/makerResponse';
import { Chat } from '../chat.entity';

export class CreateChatCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(CreateChatCommand)
export class CreateChatCase implements ICommandHandler<CreateChatCommand> {
  private readonly logger = new Logger(CreateChatCase.name);

  constructor(
    private readonly chatsRepository: ChatsRepository,
    private readonly botRepository: BotRepository,
    private readonly configService: ConfigService,
  ) {}

  async execute(command: CreateChatCommand) {
    try {
      const { message } = command;
      const chatId: number = message.chat_id;
      const userId: number = (message.sender_id as Td.messageSenderUser)
        .user_id;

      //Проверка, может уже есть такой
      await this.findChat(chatId);
      const ownerId = await this.findOwnerId(chatId);

      //Проверка, что владелец запросил команду и что это не личный чат
      this.checkRights(ownerId, userId);

      //Топики
      const forums: Td.forumTopics | null =
        await this.botRepository.getForumTopics(chatId);

      await this.createChat(chatId, ownerId, !!forums);

      return makerResponse(1);
    } catch (e) {
      this.logger.error(e);
      return makerResponse(0);
    }
  }
  private async findChat(chatId: number) {
    const chat: Chat | null = await this.chatsRepository.findByChatId(
      chatId.toString(),
    );
    if (chat) {
      throw new Error('Chat found');
    }
  }
  private checkRights(ownerId: number, userId: number) {
    const OI = Number(this.configService.get('POLICE_DEVOPS_USER_ID'));
    if (ownerId !== userId || ownerId !== OI) {
      throw new Error('User is not owner');
    }
  }

  private async createChat(
    chatId: number,
    ownerId: number,
    forums: boolean,
  ): Promise<Chat> {
    const newChat = Chat.create({
      chatId: String(chatId),
      hasThreads: forums,
      ownerId: String(ownerId),
    });
    const savedChat = await this.chatsRepository.save(newChat);
    if (!savedChat) {
      throw new Error('Chat not saved');
    }
    return savedChat;
  }

  private async findOwnerId(chatId: number): Promise<number> {
    const admins: Array<Td.chatAdministrator> =
      await this.botRepository.getChatAdministrators(chatId);
    const ownerId = admins.find((a) => a.is_owner === true)?.user_id;
    if (!ownerId) {
      throw new Error('Owner not found');
    }
    return ownerId;
  }
}
