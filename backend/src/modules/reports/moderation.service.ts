import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment, Post } from '../blog/schemas/blog.schemas';
import { Review } from '../reviews/schemas/review.schema';
import { Itinerary } from '../itineraries/schemas/itinerary.schema';
import { BlogService } from '../blog/blog.service';
import { ReviewsService } from '../reviews/reviews.service';
import { UploadsService } from '../uploads/uploads.service';
import { PostStatus, ReportTargetType, Visibility } from '../../common/enums';
import { notFound } from '../../common/utils/errors';

/** Content operations shared by reporting (GEN-09) and admin moderation (GEN-10). */
@Injectable()
export class ModerationService {
  constructor(
    @InjectModel(Post.name) private posts: Model<Post>,
    @InjectModel(Comment.name) private comments: Model<Comment>,
    @InjectModel(Review.name) private reviews: Model<Review>,
    @InjectModel(Itinerary.name) private itineraries: Model<Itinerary>,
    private blog: BlogService,
    private reviewsService: ReviewsService,
    private uploads: UploadsService,
  ) {}

  private model(type: ReportTargetType): Model<any> {
    switch (type) {
      case ReportTargetType.POST:
        return this.posts;
      case ReportTargetType.COMMENT:
        return this.comments;
      case ReportTargetType.REVIEW:
        return this.reviews;
      case ReportTargetType.ITINERARY:
        return this.itineraries;
    }
  }

  async get(type: ReportTargetType, id: string | Types.ObjectId) {
    const doc = await this.model(type).findById(id);
    if (!doc) throw notFound(`${type[0].toUpperCase()}${type.slice(1)}`);
    return doc;
  }

  /** Whether the item is publicly visible and therefore reportable by other users. */
  isReportable(type: ReportTargetType, doc: any) {
    if (doc.hidden) return false;
    if (type === ReportTargetType.POST) return doc.status === PostStatus.PUBLISHED && !doc.authorDeactivated;
    if (type === ReportTargetType.ITINERARY) return doc.visibility === Visibility.PUBLIC && !doc.authorDeactivated;
    return true;
  }

  ownerOf(type: ReportTargetType, doc: any): string {
    if (type === ReportTargetType.ITINERARY) return String(doc.owner);
    if (type === ReportTargetType.REVIEW) return String(doc.user);
    return String(doc.author);
  }

  summary(type: ReportTargetType, doc: any) {
    if (!doc) return null;
    switch (type) {
      case ReportTargetType.POST:
        return { title: doc.title, hidden: doc.hidden };
      case ReportTargetType.COMMENT:
        return { body: doc.body, postId: String(doc.post), hidden: doc.hidden };
      case ReportTargetType.REVIEW:
        return { rating: doc.rating, text: doc.text, hotelId: String(doc.hotel), hidden: doc.hidden };
      case ReportTargetType.ITINERARY:
        return { title: doc.title, hidden: doc.hidden };
    }
  }

  async setHidden(type: ReportTargetType, id: string | Types.ObjectId, hidden: boolean) {
    const doc = await this.get(type, id);
    doc.hidden = hidden;
    await doc.save();
    if (type === ReportTargetType.COMMENT) await this.blog.refreshCounts(doc.post);
    if (type === ReportTargetType.REVIEW) await this.reviewsService.recalc(doc.hotel);
    return doc;
  }

  async delete(type: ReportTargetType, id: string | Types.ObjectId) {
    const doc = await this.get(type, id);
    switch (type) {
      case ReportTargetType.POST:
        await this.blog.deletePostCascade(doc);
        break;
      case ReportTargetType.COMMENT:
        await doc.deleteOne();
        await this.blog.refreshCounts(doc.post);
        break;
      case ReportTargetType.REVIEW:
        await doc.deleteOne();
        await this.reviewsService.recalc(doc.hotel);
        break;
      case ReportTargetType.ITINERARY: {
        const files = doc.days.flatMap((d: any) => d.activities.flatMap((a: any) => a.images.map((i: any) => i.filename)));
        await doc.deleteOne();
        for (const f of files) await this.uploads.remove(f);
        break;
      }
    }
    return doc;
  }
}
