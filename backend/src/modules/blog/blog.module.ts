import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Comment, CommentSchema, Like, LikeSchema, Post, PostSchema } from './schemas/blog.schemas';
import { BlogService } from './blog.service';
import { BlogController } from './blog.controller';
import { ItinerariesModule } from '../itineraries/itineraries.module';

@Module({
  imports: [
    ItinerariesModule,
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Like.name, schema: LikeSchema },
    ]),
  ],
  controllers: [BlogController],
  providers: [BlogService],
  exports: [BlogService, MongooseModule],
})
export class BlogModule {}
