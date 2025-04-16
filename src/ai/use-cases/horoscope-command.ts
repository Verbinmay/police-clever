import OpenAI from 'openai';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { BotRepository } from '../../bot/bot.repository';
import { ChatsRepository } from '../../chats/chats.repository';
import { makerResponse } from '../../shared/utils/makerResponse';
import { AiRepository } from '../ai.repository';

export class HoroscopeCommand {
  constructor() {}
}

@CommandHandler(HoroscopeCommand)
export class HoroscopeCase implements ICommandHandler<HoroscopeCommand> {
  private readonly logger = new Logger(HoroscopeCase.name);
  private readonly promt = `Составь мне 12 матерных благоприятных или не очень предсказаний в духе гороскопа, и пришли в таком формате ["предсказание","предсказание"]}. Не присылай ничего, кроме массива с предсказаниями! `;
  private readonly signs = [
    '♈️ Овен',
    '♉️ Телец',
    '♊️ Близнецы',
    '♋️ Рак',
    '♌️ Лев',
    '♍️ Дева',
    '♎️ Весы',
    '♏️ Скорпион',
    '♐️ Стрелец',
    '♑️ Козерог',
    '♒️ Водолей',
    '♓️ Рыбы',
  ];
  constructor(
    private readonly aiRepository: AiRepository,
    private readonly chatsRepository: ChatsRepository,
    private readonly botRepository: BotRepository,
  ) {}

  async execute() {
    try {
      const answer: string = await this.getAiResponse();

      const horoscopes = this.findPredictions(answer);

      const messageText = this.createHoroscopeText(horoscopes);
      const chats = await this.chatsRepository.findAll();

      for (const chat of chats) {
        await this.botRepository.sendMessage(
          Number(chat.chatId),
          messageText,
          Number(chat.mainThreadId),
        );
      }
      makerResponse(1);
    } catch (e) {
      this.logger.error(e);
      return makerResponse(0);
    }
  }

  private async getAiResponse() {
    const answer: OpenAI.Chat.Completions.ChatCompletion | null =
      await this.aiRepository.getRequest(this.promt, '');
    if (!answer?.choices?.[0]?.message?.content) {
      throw new Error('AI response not found');
    }
    return answer.choices[0].message.content;
  }

  private findPredictions(answer: string) {
    const horoscopes = JSON.parse(answer) as string[];

    if (horoscopes.length !== 12) {
      throw new Error('Horoscopes length is not 12');
    }
    return horoscopes;
  }

  private createHoroscopeText(horoscopes: string[]) {
    let message = 'HOROSCOPE\n';
    for (const sign of this.signs) {
      const randomIndex = Math.floor(Math.random() * horoscopes.length);
      const randomHoroscope = horoscopes[randomIndex];
      horoscopes.splice(randomIndex, 1);
      message += `${sign} - ${randomHoroscope}\n`;
    }
    return message;
  }
}
