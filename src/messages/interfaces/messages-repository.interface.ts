import { Message } from '../message.entity';

//TODO: поправить все интерфейсы
export interface IMessagesRepository {
  save(message: Message): Promise<Message | null>;
  findByUserId(userId: string): Promise<Message | null>;
}
