import OpenAI from 'openai';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';

import { APP_SETTINGS } from '../app/settings/app-settings';
import { BotModule } from '../bot/bot.module';
import { ChatsModule } from '../chats/chats.module';
import { MessagesModule } from '../messages/messages.module';
import { UsersModule } from '../users/users.module';
import { AiHandler } from './ai.handler';
import { AiRepository } from './ai.repository';
import { AiService } from './ai.service';
import { LINKS } from './constants/links';
import { RandomAnswerCase } from './use-cases/create-random-message-command';
import { HoroscopeCase } from './use-cases/horoscope-command';

const useCases = [RandomAnswerCase, HoroscopeCase, HoroscopeCase];
@Module({
  imports: [BotModule, ChatsModule, MessagesModule, UsersModule, CqrsModule],
  controllers: [],
  providers: [
    {
      provide: 'AI_CLIENT',
      useFactory: (configService: ConfigService) => {
        const openai = new OpenAI({
          baseURL: LINKS.deepSeek,
          apiKey: configService.get(APP_SETTINGS.POLICE_DEEP_TOKEN),
          maxRetries: 4,
        });
        return openai;
      },
      inject: [ConfigService],
    },
    AiHandler,
    AiService,
    AiRepository,
    ...useCases,
  ],
})
export class AiModule {}
