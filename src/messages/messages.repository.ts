import { LessThan, Repository } from 'typeorm';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { MessageDB } from '../db/entities/messageDB.entity';
import { IMessagesRepository } from './interfaces/messages-repository.interface';
import { Message } from './message.entity';

@Injectable()
export class MessagesRepository implements IMessagesRepository {
  constructor(
    @InjectRepository(MessageDB)
    private readonly messagesRepository: Repository<MessageDB>,
  ) {}

  async save(message: Message): Promise<Message | null> {
    try {
      const messageDB = this.toPersistence(message);
      const savedMessage = await this.messagesRepository.save(messageDB);
      return this.toDomain(savedMessage);
    } catch (error) {
      console.error('Error saving message:', error);
      return null;
    }
  }
  async findByUserId(userId: string): Promise<Message | null> {
    try {
      const message = await this.messagesRepository.findOneBy({
        idTg: userId,
      });
      return message ? this.toDomain(message) : null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }
  async findLastMessageByChatId(chatId: string) {
    try {
      const message = await this.messagesRepository.findOne({
        where: { chatId },
        order: { createAt: 'DESC' },
      });
      return message ? this.toDomain(message) : null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async findNLastMessagesInThread(chatId: string, threadId: string, n: number) {
    try {
      return await this.messagesRepository.find({
        where: { chatId, threadId },
        order: { createAt: 'DESC' },
        take: n,
      });
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  async deleteNHoursOldMessages(n: number): Promise<void> {
    try {
      const threeHoursAgo = new Date(Date.now() - n * 60 * 60 * 1000);
      await this.messagesRepository.delete({
        createAt: LessThan(threeHoursAgo),
      });
    } catch (error) {
      console.error('Error deleting messages older than 3 hours:', error);
    }
  }

  private toDomain(entity: MessageDB): Message {
    return new Message({ ...entity });
  }
  private toPersistence(domain: Message): MessageDB {
    const messageDB = new MessageDB();
    messageDB.id = domain.id;
    messageDB.idTg = domain.idTg;
    messageDB.chatId = domain.chatId;
    messageDB.text = domain.text;
    messageDB.createAt = domain.createAt;
    messageDB.threadId = domain.threadId;
    return messageDB;
  }
}
