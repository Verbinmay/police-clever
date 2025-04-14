import { getTdjson } from 'prebuilt-tdlib';
import * as tdl from 'tdl';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';

import { APP_SETTINGS } from '../app/settings/app-settings';
import { BotHandler } from './bot.handler';
import { BotRepository } from './bot.repository';
import { BotService } from './bot.service';
import { HelpCase } from './use-cases/help-command';
import { YesNoCase } from './use-cases/yes-no-command';
import { filterTdlEvents, FilterTdlEventsType } from './utils/filterTdlEvents';

const useCases = [YesNoCase, HelpCase];

@Module({
  imports: [CqrsModule, EventEmitterModule],
  controllers: [],
  providers: [
    {
      provide: 'TDL_CLIENT',
      useFactory: async (
        configService: ConfigService,
        eventEmitter: EventEmitter2,
      ) => {
        tdl.configure({ tdjson: getTdjson() });
        const clientTG = tdl.createClient({
          apiId: Number(
            configService.get<string>(APP_SETTINGS.POLICE_TG_API_ID),
          ),
          apiHash: configService.get<string>(APP_SETTINGS.POLICE_TG_API_HASH)!,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));

        clientTG.on('error', (error) => {
          eventEmitter.emit('tdclient.error', error);
        });
        clientTG.on('update', (update) => {
          const result: FilterTdlEventsType = filterTdlEvents(update);

          if (result.on) {
            eventEmitter.emitAsync(result.event, update).catch(() => {});
          }
        });
        await clientTG.login();
        return clientTG;
      },
      inject: [ConfigService, EventEmitter2],
    },
    BotService,
    BotHandler,
    BotRepository,
    ...useCases,
  ],
  exports: [BotRepository],
})
export class BotModule {}
