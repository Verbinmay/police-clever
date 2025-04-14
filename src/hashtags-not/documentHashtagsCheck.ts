// import type * as Td from 'tdlib-types';

// import { Logger } from '@nestjs/common';
// import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

// import { makerResponse } from '../../shared/utils/makerResponse';
// import { ChatsEntity } from '../../chats/chats.entity';
// import { HashtagsEntity } from '../../hashtags/hashtags.entity';

// export class DocumentHashtagsCheckCommand {
//   constructor(public message: Td.message) {}
// }

// @CommandHandler(DocumentHashtagsCheckCommand)
// export class DocumentHashtagsCheckCase
//   implements ICommandHandler<DocumentHashtagsCheckCommand>
// {
//   private readonly logger = new Logger(DocumentHashtagsCheckCase.name);
//   private static readonly HASHTAG_REGEX = /#[a-zA-Zа-яА-Я0-9_]+/g;

//   constructor(
//     private readonly hashtagsRepository: MongoHashtagRepository,
//     private readonly chatsRepository: MongoChatsRepository,
//   ) {}

//   async execute(command: DocumentHashtagsCheckCommand) {
//     try {
//       const { message } = command;
//       const content = message.content as Td.messageDocument;
//       const text = content.caption?.text || '';

//       //Поиск хештегов в тексте
//       const hashtags: string[] = this.extractHashtags(text);
//       if (hashtags.length === 0) {
//         this.logger.debug('No hashtags found in message');
//         return makerResponse(0);
//       }

//       //Проверить нужно ли обрабатывать сообщение из этого чата
//       const chat = await this.validateChatConditions(message);
//       if (!chat) {
//         this.logger.debug('Message does not meet chat conditions');
//         return makerResponse(0);
//       }

//       //Сохранить хештеги в базу
//       await this.upsertHashtagsEntity(message, chat, hashtags);
//       return makerResponse(1);
//     } catch (e) {
//       this.logger.error(e);
//       return makerResponse(0);
//     }
//   }

//   private extractHashtags(text: string): string[] {
//     const matches: Array<string> = [];
//     let match: RegExpExecArray | null;
//     while (
//       (match = DocumentHashtagsCheckCase.HASHTAG_REGEX.exec(text)) !== null
//     ) {
//       matches.push(match[0]);
//     }
//     return [...new Set(matches.map((h) => h.slice(1).toLowerCase()))];
//   }

//   private async validateChatConditions(message: Td.message) {
//     const chat: ChatsEntity | null = await this.chatsRepository.findByChatId(
//       message.chat_id.toString(),
//     );

//     if (!chat) {
//       return null;
//     }
//     return chat?.followHashtags && this.isValidThread(chat, message)
//       ? chat
//       : null;
//   }

//   private isValidThread(
//     chat: { hasThreads?: boolean; followedThreadIds?: string[] },
//     message: Td.message,
//   ) {
//     return (
//       !chat.hasThreads ||
//       chat.followedThreadIds?.includes(message.message_thread_id.toString())
//     );
//   }

//   private async upsertHashtagsEntity(
//     message: Td.message,
//     chat: { hasThreads?: boolean },
//     newHashtags: string[],
//   ) {
//     const threadId = chat.hasThreads
//       ? message.message_thread_id.toString()
//       : '0';

//     let hashtagsEntity = await this.hashtagsRepository.findByChatIdAndThreadId(
//       message.chat_id.toString(),
//       threadId,
//     );

//     if (!hashtagsEntity) {
//       hashtagsEntity = HashtagsEntity.create({
//         chatId: message.chat_id.toString(),
//         messageThreadId: threadId,
//         hashtags: newHashtags,
//       });
//     } else {
//       hashtagsEntity.hashtags = [
//         ...new Set([...hashtagsEntity.hashtags, ...newHashtags]),
//       ];
//     }

//     await this.hashtagsRepository.save(hashtagsEntity);
//     this.logger.log(
//       `Updated hashtags for chat ${message.chat_id}, thread ${threadId}`,
//     );
//   }
// }
