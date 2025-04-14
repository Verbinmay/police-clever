// import { HydratedDocument } from 'mongoose';

// import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// import { IHashtagsFields } from '../../../../../shared/types/hashtags-fields.interface';

// export type HashtagsDocument = HydratedDocument<HashtagsMongoose>;

// @Schema()
// export class HashtagsMongoose implements IHashtagsFields {
//   @Prop({ unique: true })
//   id: string;
//   @Prop()
//   hashtags: string[];
//   @Prop()
//   chatId: string;
//   @Prop({ index: true })
//   messageThreadId: string;
// }

// export const HashtagsMongooseSchema =
//   SchemaFactory.createForClass(HashtagsMongoose);
