import { Repository } from 'typeorm';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { LastDB } from '../db/entities/lastDB.entity';

@Injectable()
export class LastRepository {
  constructor(
    @InjectRepository(LastDB)
    private readonly lastRepository: Repository<LastDB>,
  ) {}

  async save(last: LastDB): Promise<LastDB | null> {
    try {
      return await this.lastRepository.save(last);
    } catch (error) {
      console.error('Error saving message:', error);
      return null;
    }
  }

  async findByIdTg(idTg: string): Promise<LastDB | null> {
    try {
      return await this.lastRepository.findOneBy({
        idTg,
      });
    } catch (error) {
      console.error(error);
      return null;
    }
  }
}
