import { randomUUID } from 'crypto';

import { CreateChatDto } from './dto/create-chat-dto';

export class Chat {
  id: string;
  chatId: string;
  hasThreads: boolean;
  mainThreadId: string;
  followHashtags: boolean;
  followedThreadIds: string[];
  ownerId: string;
  adminsIds: string[];

  constructor(
    dto: CreateChatDto & {
      id: string;
      followHashtags: boolean;
      followedThreadIds: string[];
      adminsIds: string[];
      mainThreadId: string;
    },
  ) {
    this.id = dto.id;
    this.chatId = dto.chatId;
    this.followHashtags = dto.followHashtags;
    this.hasThreads = dto.hasThreads;
    this.followedThreadIds = dto.followedThreadIds;
    this.ownerId = dto.ownerId;
    this.adminsIds = dto.adminsIds;
    this.mainThreadId = dto.mainThreadId;
  }

  static create(data: CreateChatDto): Chat {
    const id = randomUUID() as string;
    return new Chat({
      ...data,
      id,
      followHashtags: false,
      followedThreadIds: [],
      adminsIds: [],
      mainThreadId: '0',
    });
  }
}
