import OpenAI from 'openai';

import { Injectable } from '@nestjs/common';

import { MessageDB } from '../db/entities/messageDB.entity';
import { MessagesRepository } from '../messages/messages.repository';
import { UsersRepository } from '../users/users.repository';
import { AiRepository } from './ai.repository';

@Injectable()
export class AiService {
  constructor(
    private readonly messagesRepository: MessagesRepository,
    private readonly usersRepository: UsersRepository,
    private readonly aiRepository: AiRepository,
  ) {}

  async findLastDialogText(chatId: number, threadId: number) {
    const messages: Array<MessageDB> =
      await this.messagesRepository.findNLastMessagesInThread(
        chatId.toString(),
        threadId.toString(),
        4,
      );

    let dialogText: string = '';

    for (const message of messages) {
      const user = await this.usersRepository.findByUserId(message.idTg);
      if (user) {
        dialogText += `${user.name}: ${message.text}\n`;
      }
    }

    return dialogText;
  }

  createPromt(text?: string) {
    const actions: Array<string> = [
      'Шути как подросток, стеби',
      'Флиртуй как раб или слуга',
      'Флиртуй очень пошло',
      'По-доброму пошути',
      'Сделай неформальный комплимент',
      'Разыграй драму так, словно ты ругаешься с мужем или женой',
      'Пришли подходящую матерную частушку',
      'Удиви всех рандомным смешным фактом',
      'Пришли очень черный анекдот',
      'Рандомное четверостишье из матерного стиха русского классика',
      'Устрой митинг',
      'Шутливо наругайся',
      'Ответь, используя жаргоны и современный сленг',
      'Пошути, используя фразы из популярных мемов',
      'Пошути, используя фразы из популярных песен',
      'Отправь свое геймерское мнение',
      'Разведи на нюдсы',
      'Смешно скажи, что пора мыть жопу, что ты в дороге',
    ];

    const action = actions[Math.floor(Math.random() * actions.length)];

    const systemPrompt = `Тебя зовут Реван, мужской пол. Проанализируй весь диалог, учитывая, что слова перед двоеточием — это ники пользователей, а текст после двоеточия — их сообщения. ${text ?? action}, без объяснений, на основе контекста разговора, от лица стороннего участника, который не писал последние сообщения. В ответе указывай только текст шутки без имён пользователей `;

    return systemPrompt;
  }

  async getAiResponse(
    promt: string,
    dialogText: string,
  ): Promise<string | null> {
    const answer: OpenAI.Chat.Completions.ChatCompletion | null =
      await this.aiRepository.getRequest(promt, dialogText);
    if (!answer?.choices?.[0]?.message?.content) {
      return null;
    }
    return answer.choices[0].message.content.replace(/"/g, '');
  }
}
