import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class UserDB {
  @PrimaryColumn({ primary: true })
  id: string;
  @Column({ nullable: true, type: 'varchar' })
  name: string | null;
  @Column({ nullable: true, type: 'timestamp' })
  birthdate: Date | null;
  @Column({ nullable: false })
  usernameTg: string;
  @Column({ nullable: false })
  idTg: string;
  @Column({ nullable: true, type: 'varchar' })
  nickname: string | null;
  @Column({ nullable: true, type: 'varchar' })
  bio: string | null;
  @Column({ nullable: false, type: 'simple-array' })
  chatIds: string[];
}
