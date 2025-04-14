import { Repository } from 'typeorm';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { ChatDB } from '../db/entities/chatDB.entity';
import { Chat } from './chat.entity';
import { IChatsRepository } from './interfaces/chats-repository.interface';

@Injectable()
export class ChatsRepository implements IChatsRepository {
  constructor(
    @InjectRepository(ChatDB)
    private readonly usersRepository: Repository<ChatDB>,
  ) {}

  async findByChatId(chatId: string): Promise<Chat | null> {
    try {
      const chat = await this.usersRepository.findOneBy({
        chatId,
      });
      return chat ? this.toDomain(chat) : null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async save(chat: Chat): Promise<Chat | null> {
    try {
      const chatDB = this.toPersistence(chat);
      const savedChat = await this.usersRepository.save(chatDB);
      return this.toDomain(savedChat);
    } catch (error) {
      console.error('Error saving chat:', error);
      return null;
    }
  }

  async findAll(): Promise<Chat[]> {
    try {
      const chats = await this.usersRepository.find();
      return chats.map((chat) => this.toDomain(chat));
    } catch (error) {
      console.error('Error fetching all chats:', error);
      return [];
    }
  }

  private toDomain(entity: ChatDB): Chat {
    return new Chat({ ...entity });
  }
  private toPersistence(domain: Chat): ChatDB {
    const chatDB = new ChatDB();
    chatDB.chatId = domain.chatId;
    chatDB.ownerId = domain.ownerId;
    chatDB.hasThreads = domain.hasThreads;
    chatDB.followHashtags = domain.followHashtags;
    chatDB.followedThreadIds = domain.followedThreadIds;
    chatDB.adminsIds = domain.adminsIds;
    chatDB.id = domain.id;
    return chatDB;
  }
}
