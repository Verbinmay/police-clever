import { randomUUID } from 'crypto';

import { CreateMessageDto } from './dto/create-message-dto';

export class Message {
  id: string;
  idTg: string;
  createAt: Date;
  text: string;
  chatId: string;
  threadId: string | null;

  constructor(
    dto: CreateMessageDto & {
      id: string;
      idTg: string;
      createAt: Date;
    },
  ) {
    this.id = dto.id;
    this.idTg = dto.idTg;
    this.createAt = dto.createAt;
    this.text = dto.text;
    this.chatId = dto.chatId;
    this.threadId = dto.threadId;
  }

  static create(data: CreateMessageDto): Message {
    const id = randomUUID() as string;
    const createAt = new Date();
    return new Message({
      ...data,
      id,
      createAt,
    });
  }
}
