import type * as Td from 'tdlib-types';

import { commandsBotMessages } from '../constants/commands';
import { partsOfCommands } from '../constants/partsOfCommands';
import { tdcConstants } from '../constants/tdcConstants';
import { commandsBotWords } from '../constants/words';

export type FilterTdlEventsType =
  | {
      event: string;
      on: true;
    }
  | {
      on: false;
    };

export function filterTdlEvents(event: Td.Update): FilterTdlEventsType {
  if (event._ === tdcConstants.updateNewMessage) {
    const message = (event as Td.updateNewMessage).message;
    if (
      [
        tdcConstants.messageText,
        tdcConstants.messageDocument,
        tdcConstants.messagePhoto,
      ].includes(message.content._)
    ) {
      if (message.content._ === tdcConstants.messageText) {
        //Поиск команды в теле сообщения
        const text = (message.content as Td.messageText).text.text;
        //TODO: убрать хардкод

        if (
          ((message.sender_id as Td.messageSenderUser)?.user_id ?? 0) ===
          7514279952
        ) {
          return { on: true, event: message.content._ };
        }

        //Поиск слов триггеров
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

        //Поиск целой команды
        if (Object.values(commandsBotMessages).includes(text)) {
          return { event: text, on: true };
        }

        //Поиск части команды
        for (const part of Object.values(partsOfCommands)) {
          if (text.includes(part)) {
            return { event: part, on: true };
          }
        }
      }
      return { on: true, event: message.content._ };
    }
  }
  return { on: false };
}
