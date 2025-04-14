// import { Model } from 'mongoose';

// import { Injectable } from '@nestjs/common';
// import { InjectModel } from '@nestjs/mongoose';

// import { HashtagsMongoose } from './hashtags-mongoose-schema';
// import { HashtagsEntity } from './hashtags.entity';
// import { IHashtagsRepository } from './hashtagsRepository.interface';

// @Injectable()
// export class MongoHashtagRepository implements IHashtagsRepository {
//   constructor(
//     @InjectModel(HashtagsMongoose.name)
//     private readonly model: Model<HashtagsMongoose>,
//   ) {}

//   // async update(dto: BaseHashtags): Promise<boolean> {
//   //   const hashtagModel = new this.HashtagsModel(dto);
//   //   const updated = await hashtagModel.save();
//   //   return updated.isModified();
//   // }

//   async findByChatIdAndThreadId(
//     chatId: string,
//     messageThreadId: string = '0',
//   ): Promise<HashtagsEntity | null> {
//     const hashtag = await this.model
//       .findOne({
//         chatId,
//         messageThreadId,
//       })
//       .lean();
//     return hashtag ? new HashtagsEntity(hashtag) : null;
//   }

//   async save(hashtags: HashtagsEntity): Promise<boolean> {
//     const hashtagModel = new this.model(hashtags);
//     const updated = await hashtagModel.save();
//     return updated.isModified();
//   }
// }
