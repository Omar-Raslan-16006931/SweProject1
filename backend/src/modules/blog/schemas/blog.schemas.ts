import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { PostStatus } from '../../../common/enums';

export type PostDocument = HydratedDocument<Post>;

@Schema()
export class PostImage {
  _id: Types.ObjectId;
  @Prop({ required: true }) url: string;
  @Prop({ required: true }) filename: string;
}
const PostImageSchema = SchemaFactory.createForClass(PostImage);

/** Blog Post + Tag (BLG-01..BLG-12). */
@Schema({ collection: 'posts', timestamps: true })
export class Post {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true }) author: Types.ObjectId;
  @Prop({ required: true, trim: true, maxlength: 200 }) title: string;
  @Prop({ required: true, maxlength: 50000 }) body: string;
  @Prop({ type: [String], default: [], index: true }) tags: string[];
  @Prop({ type: [PostImageSchema], default: [] }) images: PostImage[];
  @Prop({ type: String, enum: PostStatus, default: PostStatus.DRAFT, index: true }) status: PostStatus;
  @Prop() publishedAt?: Date;
  @Prop({ default: 0 }) likesCount: number;
  @Prop({ default: 0 }) commentsCount: number;
  /** BLG-09 interaction score = likes + comments (kept in sync). */
  @Prop({ default: 0, index: true }) score: number;
  @Prop({ default: false, index: true }) hidden: boolean;
  @Prop({ default: false, index: true }) authorDeactivated: boolean;
}
export const PostSchema = SchemaFactory.createForClass(Post);

/** Comment (BLG-05, BLG-07). */
@Schema({ collection: 'comments', timestamps: true })
export class Comment {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Post', required: true, index: true }) post: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true }) author: Types.ObjectId;
  @Prop({ required: true, maxlength: 500 }) body: string;
  @Prop({ default: false, index: true }) hidden: boolean;
}
export const CommentSchema = SchemaFactory.createForClass(Comment);

/** Like (BLG-06): at most one per user per post (unique index). */
@Schema({ collection: 'likes', timestamps: { createdAt: true, updatedAt: false } })
export class Like {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Post', required: true }) post: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true }) user: Types.ObjectId;
}
export const LikeSchema = SchemaFactory.createForClass(Like);
LikeSchema.index({ post: 1, user: 1 }, { unique: true });
