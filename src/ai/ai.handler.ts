import type * as Td from 'tdlib-types';

import { Controller } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';

import { partsOfCommands } from '../bot/constants/partsOfCommands';
import { tdcConstants } from '../bot/constants/tdcConstants';
import { EventsFilterService } from '../bot/events.filter.service';
import { RandomAnswerCommand } from './use-cases/create-random-message-command';
import { HoroscopeCommand } from './use-cases/horoscope-command';

@Controller('ai')
export class AiHandler {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly eventsFilterService: EventsFilterService,
  ) {}
  private counter = 1;
  private lastUsed: number;

  @OnEvent(partsOfCommands.renia)
  async handleRevanAnswer(update: Td.updateNewMessage) {
    if (this.hasTries()) {
      const message: Td.message = update.message;
      await this.commandBus.execute(new RandomAnswerCommand(message));
      return;
    }
    console.log('Пока не время для ответа');
  }

  @OnEvent(tdcConstants.messageText)
  async handleAiAnswer(update: Td.updateNewMessage) {
    const isActive = this.eventsFilterService.isInstanceActive();
    if (isActive && this.gacha()) {
      const message: Td.message = update.message;
      await this.commandBus.execute(new RandomAnswerCommand(message));
    }
  }

  @Cron('0 0 7 * * *') // Каждый день в 7:00
  async handleHoroscope() {
    console.log('Гороскоп');
    await this.commandBus.execute(new HoroscopeCommand());
  }

  private hasTries(): boolean {
    const now = Date.now();
    const diff = now - this.lastUsed;
    const diffInMinutes = Math.floor(diff / 1000 / 60);
    if (diffInMinutes < 5) {
      return false;
    }
    this.lastUsed = now;
    return true;
  }

  private gacha(): boolean {
    // Гарантированный выигрыш на 140-й попытке
    if (this.counter >= 140) {
      this.counter = 1;
      return true;
    }

    // Определяем вероятность в зависимости от диапазона
    let probability: number;
    if (this.counter <= 20) {
      probability = 0.005; // 0.5%
    } else if (this.counter <= 40) {
      probability = 0.01; // 1%
    } else if (this.counter <= 90) {
      probability = 0.02; // 2%
    } else {
      probability = 0.05; // 5%
    }

    // Проверяем выигрыш
    if (Math.random() < probability) {
      this.counter = 1;
      return true;
    } else {
      this.counter++;
      return false;
    }
  }
}
