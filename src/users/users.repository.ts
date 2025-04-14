import { Repository, UpdateResult } from 'typeorm';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { UserDB } from '../db/entities/userDB.entity';
import { IUsersRepository } from './interfaces/users-repository.interface';
import { User } from './users.entity';

@Injectable()
export class UsersRepository implements IUsersRepository {
  //TODO!: сделать логер
  constructor(
    @InjectRepository(UserDB)
    private readonly usersRepository: Repository<UserDB>,
  ) {}

  async save(user: User): Promise<User | null> {
    try {
      const userDB = this.toPersistence(user);
      const savedUser = await this.usersRepository.save(userDB);
      return this.toDomain(savedUser);
    } catch (error) {
      console.error('Error saving user:', error);
      return null;
    }
  }

  async findByUserId(userId: string): Promise<User | null> {
    try {
      const user = await this.usersRepository.findOneBy({
        idTg: userId,
      });
      return user ? this.toDomain(user) : null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    try {
      const user = await this.usersRepository.findOneBy({
        usernameTg: username,
      });
      return user ? this.toDomain(user) : null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async findAllUsers(): Promise<User[]> {
    try {
      const users = await this.usersRepository.find();
      return users.map((user) => this.toDomain(user));
    } catch (error) {
      console.error('Error fetching all users:', error);
      return [];
    }
  }

  async patchUserBio(userId: string, bio: string | null): Promise<boolean> {
    try {
      const result: UpdateResult = await this.usersRepository.update(
        {
          idTg: userId,
        },
        {
          bio,
        },
      );
      return (result.affected ?? 0) > 0;
    } catch (error) {
      console.error('Error updating user bio:', error);
      return false;
    }
  }
  async patchUserBirthday(
    userId: string,
    birthdate: Date | null,
  ): Promise<boolean> {
    try {
      const result: UpdateResult = await this.usersRepository.update(
        {
          idTg: userId,
        },
        {
          birthdate,
        },
      );
      return (result.affected ?? 0) > 0;
    } catch (error) {
      console.error('Error updating user birthdate:', error);
      return false;
    }
  }

  private toDomain(entity: UserDB): User {
    return new User({ ...entity });
  }
  private toPersistence(domain: User): UserDB {
    const userDB = new UserDB();
    userDB.idTg = domain.idTg;
    userDB.usernameTg = domain.usernameTg;
    userDB.name = domain.name;
    userDB.nickname = domain.nickname;
    userDB.birthdate = domain.birthdate;
    userDB.id = domain.id;
    userDB.bio = domain.bio;
    userDB.chatIds = domain.chatIds;
    return userDB;
  }
}
