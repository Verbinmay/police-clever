import type * as Td from 'tdlib-types';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { BotRepository } from '../../bot/bot.repository';
import { partsOfCommands } from '../../bot/constants/partsOfCommands';
import { Chat } from '../../chats/chat.entity';
import { ChatsRepository } from '../../chats/chats.repository';
import { makerResponse } from '../../shared/utils/makerResponse';
import { AiService } from '../ai.service';

export class RandomAnswerCommand {
  constructor(public message: Td.message) {}
}

@CommandHandler(RandomAnswerCommand)
export class RandomAnswerCase implements ICommandHandler<RandomAnswerCommand> {
  private readonly logger = new Logger(RandomAnswerCase.name);

  constructor(
    private readonly botRepository: BotRepository,
    private readonly chatsRepository: ChatsRepository,
    private readonly aiService: AiService,
  ) {}

  async execute(command: RandomAnswerCommand) {
    try {
      const { message } = command;
      const chatId: number = message.chat_id;
      const threadId: number = this.findThreadId(message);
      const text = (message.content as Td.messageText).text.text;

      //Проверка, что чат существует в базе
      await this.findChat(chatId);

      const dialogText: string = await this.aiService.findLastDialogText(
        chatId,
        threadId,
      );

      const promt = this.aiService.createPromt(
        text.includes(partsOfCommands.renia) ? text : undefined,
      );

      const answer: string = await this.getAiResponse(promt, dialogText);
      await this.botRepository.sendMessage(
        message.chat_id,
        answer,
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

  private findThreadId(message: Td.message) {
    const threadId: number | undefined = message.message_thread_id ?? null;
    if (!threadId) {
      throw new Error('Thread ID not found');
    }
    return threadId;
  }

  private async getAiResponse(promt: string, dialogText: string) {
    const answer = await this.aiService.getAiResponse(promt, dialogText);
    if (!answer) {
      throw new Error('AI response not found');
    }
    return answer;
  }
}
