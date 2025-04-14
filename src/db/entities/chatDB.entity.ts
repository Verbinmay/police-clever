import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class ChatDB {
  @PrimaryColumn({ primary: true })
  id: string;
  @Column({ nullable: false })
  chatId: string;
  @Column({ nullable: false, type: 'boolean' })
  hasThreads: boolean;
  @Column({ nullable: false, type: 'boolean' })
  followHashtags: boolean;
  @Column({ nullable: false, type: 'simple-array' })
  followedThreadIds: string[];
  @Column({ nullable: false })
  ownerId: string;
  @Column({ nullable: false, type: 'simple-array' })
  adminsIds: string[];
}
