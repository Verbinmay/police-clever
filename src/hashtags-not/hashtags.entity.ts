import { randomUUID } from 'crypto';

import { HashtagsCreateType } from './hashtags-create.type';
import { IHashtagsFields } from './hashtags-fields.interface';

export class HashtagsEntity implements IHashtagsFields {
  id: string;
  hashtags: string[];
  chatId: string;
  messageThreadId: string;

  constructor(dto: IHashtagsFields) {
    this.id = dto.id;
    this.hashtags = dto.hashtags;
    this.chatId = dto.chatId;
    this.messageThreadId = dto.messageThreadId;
  }

  static create(obj: HashtagsCreateType): HashtagsEntity {
    return new HashtagsEntity({ ...obj, id: randomUUID() });
  }
}
