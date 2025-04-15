import type * as Td from 'tdlib-types';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { APP_SETTINGS } from '../app/settings/app-settings';
import { commandsBotMessages } from './constants/commands';
import { devCommands } from './constants/devCommands';
import { partsOfCommands } from './constants/partsOfCommands';
import { tdcConstants } from './constants/tdcConstants';
import { commandsBotWords } from './constants/words';
import { FilterTdlEventsType } from './interfaces/filter.type';

@Injectable()
export class BotService {
  constructor(private readonly configService: ConfigService) {}

  findAddedTextInMessage(message: Td.message): string {
    const text: string = (message.content as Td.messageText).text.text;
    const info = text.split(' ');
    let customTitle = 'NULLNULL';
    if (info.length >= 2) {
      const [, ...rest] = text.split(' ');
      customTitle = rest.join(' ');
    }
    return customTitle;
  }

  filterEvents(update: Td.Update, isActive: boolean): FilterTdlEventsType {
    try {
      const supportsEvent = this.isSupportedEventType(update._);
      if (supportsEvent) return supportsEvent;

      const message: Td.message = (update as Td.updateNewMessage).message;

      const supportsContent = this.isSupportedContentType(message.content._);
      if (supportsContent) return supportsContent;

      const isDevCommand = this.findForDevCommand(message);
      if (isDevCommand) return isDevCommand;

      //Если не активно, то просто вернет ивент с типом сообщения для перехвата в ласт и мессадж
      if (!isActive) return { on: true, event: message.content._ };

      if (message.content._ === tdcConstants.messageText) {
        const hasTextCommand = this.findTextCommand(message);
        if (hasTextCommand) return hasTextCommand;
      }
      return { on: true, event: message.content._ };
    } catch (error) {
      console.error('Error in filterEvents:', error);
      return { on: false };
    }
  }

  private isSupportedEventType(type: string) {
    if (type !== tdcConstants.updateNewMessage) {
      return { on: false };
    }
    return null;
  }

  private isSupportedContentType(type: string) {
    const hasRightType = [
      tdcConstants.messageText,
      tdcConstants.messageDocument,
      tdcConstants.messagePhoto,
    ].includes(type);
    if (!hasRightType) {
      return { on: false };
    }
    return null;
  }

  private findForDevCommand(message: Td.message) {
    const text = (message.content as Td.messageText)?.text?.text ?? null;
    if (text) {
      for (const part of Object.values(devCommands)) {
        if (text.includes(part)) {
          return { event: part, on: true };
        }
      }
    }
    return null;
  }

  private findTriggerWord(text: string) {
    const foundCommand =
      Object.entries(commandsBotWords).find(
        ([, value]) => value === text.toLocaleLowerCase(),
      ) ?? null;
    if (foundCommand) {
      return {
        event: '/' + foundCommand[1],
        on: true,
      };
    }
    return null;
  }

  private findFullWord(text: string) {
    if (Object.values(commandsBotMessages).includes(text)) {
      return { event: text, on: true };
    }
    return null;
  }

  private findPartOfCommand(text: string) {
    for (const part of Object.values(partsOfCommands)) {
      if (text.includes(part)) {
        return { event: part, on: true };
      }
    }
    return null;
  }

  private isSelfMessage(message: Td.message) {
    const senderId = (message.sender_id as Td.messageSenderUser)?.user_id ?? 0;
    const clientId = Number(
      this.configService.get<number>(APP_SETTINGS.POLICE_CLIENT_USER_ID),
    );

    if (senderId === clientId) {
      return { on: true, event: message.content._ };
    }
    return null;
  }

  private findTextCommand(message: Td.message) {
    const text = (message.content as Td.messageText).text.text;

    const isSelfMessage = this.isSelfMessage(message);
    if (isSelfMessage) return isSelfMessage;

    const isTriggerWordCommand = this.findTriggerWord(text);
    if (isTriggerWordCommand) return isTriggerWordCommand;

    const isFullWordCommand = this.findFullWord(text);
    if (isFullWordCommand) return isFullWordCommand;

    const isPartOfCommand = this.findPartOfCommand(text);
    if (isPartOfCommand) return isPartOfCommand;

    return null;
  }
}
