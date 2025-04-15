import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { Chat } from '../../chats/chat.entity';
import { ChatsRepository } from '../../chats/chats.repository';
import { makerResponse } from '../../shared/utils/makerResponse';
import { CreateMessageDto } from '../dto/create-message-dto';
import { LastRepository } from '../last.repository';
import { Message } from '../message.entity';
import { MessagesRepository } from '../messages.repository';

export class SaveMessageCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(SaveMessageCommand)
export class SaveMessageCase implements ICommandHandler<SaveMessageCommand> {
  private readonly logger = new Logger(SaveMessageCase.name);

  constructor(
    private readonly chatsRepository: ChatsRepository,
    private readonly messagesRepository: MessagesRepository,
    private readonly lastRepository: LastRepository,
  ) {}

  async execute(command: SaveMessageCommand) {
    try {
      const { message } = command;
      const chatId: number = message.chat_id;
      const userId: number = (message.sender_id as Td.messageSenderUser)
        .user_id;
      await this.findChat(chatId);
      const text: string = (message.content as Td.messageText).text.text;

      const newMessage: Message = this.createMessage(
        message,
        chatId,
        userId,
        text,
      );
      await this.saveMessage(newMessage);
      await this.saveLast(userId);
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

  private createMessage(
    message: Td.message,
    chatId: number,
    userId: number,
    text: string,
  ) {
    const threadId = message.message_thread_id ?? null;
    const messageInfo: CreateMessageDto = {
      chatId: chatId.toString(),
      idTg: userId.toString(),
      text: text,
      threadId: threadId !== null ? threadId.toString() : null,
    };

    return Message.create(messageInfo);
  }

  private async saveMessage(message: Message) {
    const result = await this.messagesRepository.save(message);
    if (!result) {
      throw new Error('Failed to save message');
    }
  }

  private async saveLast(idTg: number) {
    const newLastEntity = { idTg: idTg.toString(), date: new Date() };
    const last = await this.lastRepository.save(newLastEntity);
    if (!last) {
      throw new Error('Failed to save last message');
    }
  }
}
