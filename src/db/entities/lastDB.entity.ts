import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class LastDB {
  @PrimaryColumn({ primary: true })
  idTg: string;
  @Column({ type: 'timestamp' })
  date: Date;
}
