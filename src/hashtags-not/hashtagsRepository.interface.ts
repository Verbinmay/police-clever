import { HashtagsEntity } from './hashtags.entity';

export interface IHashtagsRepository {
  findByChatIdAndThreadId(
    chat_id: string,
    message_thread_id?: string,
  ): Promise<HashtagsEntity | null>;
  save(hashtags: HashtagsEntity): Promise<boolean>;
}
