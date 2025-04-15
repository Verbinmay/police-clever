import { getTdjson } from 'prebuilt-tdlib';
import * as tdl from 'tdl';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { APP_SETTINGS } from '../app/settings/app-settings';
import { BotHandler } from './bot.handler';
import { BotRepository } from './bot.repository';
import { BotService } from './bot.service';
import { EventsFilterService } from './events.filter.service';
import { DevEnableCase } from './use-cases/dev-enable-command';
import { HelpCase } from './use-cases/help-command';
import { StatusCase } from './use-cases/status-command';
import { YesNoCase } from './use-cases/yes-no-command';

const useCases = [YesNoCase, HelpCase, DevEnableCase, StatusCase];

@Module({
  imports: [CqrsModule, EventEmitterModule],
  controllers: [],
  providers: [
    BotService,
    ...useCases,

    EventsFilterService,
    {
      provide: 'TDL_CLIENT',
      useFactory: async (
        configService: ConfigService,
        tdlEventService: EventsFilterService,
      ) => {
        tdl.configure({ tdjson: getTdjson() });

        const clientTG = tdl.createClient({
          apiId: Number(
            configService.get<string>(APP_SETTINGS.POLICE_TG_API_ID),
          ),
          apiHash: configService.get<string>(APP_SETTINGS.POLICE_TG_API_HASH)!,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));

        tdlEventService.setupClientListeners(clientTG);
        await clientTG.login();
        return clientTG;
      },
      inject: [ConfigService, EventsFilterService],
    },
    BotHandler,
    BotRepository,
  ],
  exports: [BotRepository, BotService],
})
export class BotModule {}
