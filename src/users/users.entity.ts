import { randomUUID } from 'crypto';

import { CreateUserDto } from './dto/create-user-dto';

export class User {
  id: string;
  name: string | null;
  birthdate: Date | null;
  usernameTg: string;
  idTg: string;
  nickname: string | null;
  bio: string | null;
  chatIds: string[];

  constructor(
    dto: CreateUserDto & {
      id: string;
      birthdate: Date | null;
      name: string | null;
      nickname: string | null;
      bio: string | null;
    },
  ) {
    this.id = dto.id;
    this.name = dto.name;
    this.birthdate = dto.birthdate;
    this.usernameTg = dto.usernameTg;
    this.idTg = dto.idTg;
    this.nickname = dto.nickname;
    this.bio = dto.bio;
    this.chatIds = dto.chatIds;
  }

  static create(data: CreateUserDto): User {
    const id = randomUUID() as string;
    return new User({
      ...data,
      id,
      birthdate: null,
      name: null,
      nickname: null,
      bio: null,
    });
  }
}
