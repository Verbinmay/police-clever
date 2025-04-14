import { User } from '../users.entity';

export interface IUsersRepository {
  save(user: User): Promise<User | null>;
  findByUserId(userId: string): Promise<User | null>;
}
