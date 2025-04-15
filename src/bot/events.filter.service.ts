import type * as Td from 'tdlib-types';

import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { BotService } from './bot.service';
import { FilterTdlEventsType } from './interfaces/filter.type';

@Injectable()
export class EventsFilterService {
  private readonly instanceId: string;
  private isActive: boolean = true;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly botService: BotService,
  ) {
    this.instanceId = this.generateInstanceId();
  }

  setupClientListeners(clientTG: any) {
    clientTG.on('error', async (error) => {
      await this.emitSafe('tdclient.error', error);
    });

    clientTG.on('update', async (update: Td.Update) => {
      const result: FilterTdlEventsType = this.filterUpdates(update);
      if (result.on) {
        await this.emitSafe(result.event!, update);
      }
    });
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  activate() {
    this.isActive = true;
  }

  deactivate() {
    this.isActive = false;
  }

  isInstanceActive(): boolean {
    return this.isActive;
  }

  private filterUpdates(update: Td.Update): FilterTdlEventsType {
    return this.botService.filterEvents(update, this.isInstanceActive());
  }

  private async emitSafe(event: string, data: any) {
    try {
      await this.eventEmitter.emitAsync(event, data);
    } catch (err) {
      console.error(`Error processing event ${event}:`, err);
    }
  }

  private generateInstanceId(): string {
    return Math.random().toString(36).slice(2, 6).toUpperCase();
  }
}
