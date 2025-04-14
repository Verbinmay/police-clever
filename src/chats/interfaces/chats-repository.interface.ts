import { Chat } from '../chat.entity';

export interface IChatsRepository {
  findByChatId(chatId: string): Promise<Chat | null>;
  save(chat: Chat): Promise<Chat | null>;
}
