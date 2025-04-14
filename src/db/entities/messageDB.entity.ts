import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class MessageDB {
  @PrimaryColumn({ primary: true })
  id: string;
  @Column({ nullable: false })
  idTg: string;
  @Column({ type: 'timestamp' })
  createAt: Date;
  @Column({ type: 'varchar' })
  text: string;
  @Column({ nullable: false })
  chatId: string;
  @Column({ nullable: true, type: 'varchar' })
  threadId: string | null;
}
