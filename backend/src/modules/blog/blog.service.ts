import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment, Like, Post, PostDocument } from './schemas/blog.schemas';
import { User, displayName } from '../users/schemas/user.schema';
import { CommentDto, CreatePostDto, PostListQueryDto, UpdatePostDto } from './dto/blog.dto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccountStatus, PostStatus, Role } from '../../common/enums';
import { isDuplicateKeyError, notFound } from '../../common/utils/errors';
import { paginateQuery } from '../../common/utils/pagination';
import { containsInsensitive } from '../../common/utils/regex';
import { UploadsService } from '../uploads/uploads.service';
import { ItinerariesService } from '../itineraries/itineraries.service';

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(Post.name) private posts: Model<Post>,
    @InjectModel(Comment.name) private comments: Model<Comment>,
    @InjectModel(Like.name) private likes: Model<Like>,
    @InjectModel(User.name) private users: Model<User>,
    private uploads: UploadsService,
    private itineraries: ItinerariesService,
  ) {}

  private publicFilter() {
    return { status: PostStatus.PUBLISHED, hidden: false, authorDeactivated: false };
  }

  private excerpt(body: string) {
    const t = body.replace(/\s+/g, ' ').trim();
    return t.length > 200 ? `${t.slice(0, 197)}...` : t;
  }

  private summary(p: any) {
    return {
      id: String(p._id),
      title: p.title,
      author: { id: String(p.author?._id ?? p.author), name: displayName(p.author) },
      date: p.publishedAt ?? p.createdAt,
      excerpt: this.excerpt(p.body),
      tags: p.tags,
      status: p.status,
      likeCount: p.likesCount,
      commentCount: p.commentsCount,
      coverImage: p.images?.[0]?.url ?? null,
    };
  }

  /** Recompute counters from source collections (likes, visible comments). */
  async refreshCounts(postId: Types.ObjectId | string) {
    const [likes, comments] = await Promise.all([
      this.likes.countDocuments({ post: postId }),
      this.comments.countDocuments({ post: postId, hidden: false }),
    ]);
    await this.posts.updateOne({ _id: postId }, { $set: { likesCount: likes, commentsCount: comments, score: likes + comments } });
    return { likes, comments };
  }

  private canSee(p: any, viewer?: AuthUser) {
    const isAuthor = viewer && String(p.author?._id ?? p.author) === viewer.id;
    if (isAuthor) return true;
    if (viewer?.role === Role.ADMIN) return true;
    return p.status === PostStatus.PUBLISHED && !p.hidden && !p.authorDeactivated;
  }

  private async getOwn(id: string, user: AuthUser): Promise<PostDocument> {
    const p = await this.posts.findById(id);
    if (!p || String(p.author) !== user.id) throw notFound('Post');
    return p;
  }

  // ------------------------------------------------------------------ posts (BLG-01..BLG-04, BLG-08)

  async create(dto: CreatePostDto, user: AuthUser) {
    const status = dto.status ?? PostStatus.DRAFT;
    const p = await this.posts.create({
      author: user.id,
      title: dto.title,
      body: dto.body,
      tags: dto.tags ?? [],
      status,
      publishedAt: status === PostStatus.PUBLISHED ? new Date() : undefined,
    });
    return this.view(p, user);
  }

  async update(id: string, dto: UpdatePostDto, user: AuthUser) {
    const p = await this.getOwn(id, user);
    if (dto.title !== undefined) p.title = dto.title;
    if (dto.body !== undefined) p.body = dto.body;
    if (dto.tags !== undefined) p.tags = dto.tags;
    if (dto.status && dto.status !== p.status) {
      p.status = dto.status;
      if (dto.status === PostStatus.PUBLISHED && !p.publishedAt) p.publishedAt = new Date();
    }
    await p.save();
    return this.view(p, user);
  }

  async remove(id: string, user: AuthUser) {
    const p = await this.getOwn(id, user);
    await this.deletePostCascade(p);
    return { deleted: true, id };
  }

  /** Shared by author deletion and admin moderation (GEN-10). */
  async deletePostCascade(p: PostDocument) {
    const files = p.images.map((i) => i.filename);
    await Promise.all([this.comments.deleteMany({ post: p._id }), this.likes.deleteMany({ post: p._id })]);
    await p.deleteOne();
    for (const f of files) await this.uploads.remove(f);
  }

  async view(p: any, viewer?: AuthUser) {
    const author = await this.users.findById(p.author?._id ?? p.author).select('name status createdAt').lean();
    const liked = viewer ? !!(await this.likes.exists({ post: p._id, user: viewer.id })) : false;
    const comments = await this.commentsFor(p._id, viewer, 1);
    return {
      id: String(p._id),
      title: p.title,
      body: p.body,
      author: { id: String(author?._id ?? p.author), name: displayName(author) },
      date: p.publishedAt ?? p.createdAt,
      status: p.status,
      tags: p.tags,
      images: p.images.map((i: any) => ({ id: String(i._id), url: i.url })),
      likeCount: p.likesCount,
      commentCount: p.commentsCount,
      likedByMe: liked,
      hidden: p.hidden,
      comments,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  /** BLG-02 */
  async getOne(id: string, viewer?: AuthUser) {
    const p = await this.posts.findById(id).lean();
    if (!p || !this.canSee(p, viewer)) throw notFound('Post');
    return this.view(p, viewer);
  }

  /** BLG-02 (browse, tag filter) and BLG-09 (keyword search ordered by interaction score). */
  async list(q: PostListQueryDto) {
    const filter: any = { ...this.publicFilter() };
    if (q.tag) filter.tags = q.tag.trim().toLowerCase();
    let sort: Record<string, 1 | -1> = { publishedAt: -1, _id: -1 };
    if (q.q?.trim()) {
      const rx = containsInsensitive(q.q);
      const authorIds = await this.users.find({ name: rx, status: { $ne: AccountStatus.DEACTIVATED } }).distinct('_id');
      filter.$or = [{ title: rx }, { tags: rx }, { author: { $in: authorIds } }];
      sort = { score: -1, publishedAt: -1, _id: -1 };
    }
    const res = await paginateQuery(this.posts, filter, q.page, sort, { path: 'author', select: 'name status' });
    return { ...res, items: res.items.map((p: any) => this.summary(p)), message: res.total ? undefined : 'No results' };
  }

  /** BLG-08: posts with a tag. */
  byTag(tag: string, page = 1) {
    return this.list({ tag, page } as PostListQueryDto);
  }

  /** BLG-03 */
  async mine(user: AuthUser, page = 1) {
    const res = await paginateQuery(this.posts, { author: user.id }, page, { updatedAt: -1 });
    return {
      ...res,
      items: res.items.map((p: any) => ({
        id: String(p._id), title: p.title, status: p.status, date: p.publishedAt ?? p.createdAt, likeCount: p.likesCount,
        commentCount: p.commentsCount, hidden: p.hidden, updatedAt: p.updatedAt,
      })),
    };
  }

  // ------------------------------------------------------------------ images (BLG-10)

  async addImages(id: string, files: Express.Multer.File[], user: AuthUser) {
    const p = await this.getOwn(id, user);
    this.uploads.validate(files, p.images.length);
    const saved = await this.uploads.save(files, 'posts');
    p.images.push(...(saved as any));
    await p.save();
    return this.view(p, user);
  }

  async removeImage(id: string, imageId: string, user: AuthUser) {
    const p = await this.getOwn(id, user);
    const img = p.images.find((i) => String(i._id) === imageId);
    if (!img) throw notFound('Image');
    p.images = p.images.filter((i) => String(i._id) !== imageId);
    await p.save();
    await this.uploads.remove(img.filename);
    return this.view(p, user);
  }

  // ------------------------------------------------------------------ comments (BLG-05, BLG-07)

  async commentsFor(postId: Types.ObjectId | string, viewer?: AuthUser, page = 1) {
    const filter: any = { post: postId };
    if (viewer?.role !== Role.ADMIN) {
      filter.$or = [{ hidden: false }, ...(viewer ? [{ author: new Types.ObjectId(viewer.id) }] : [])];
    }
    const res = await paginateQuery(this.comments, filter, page, { createdAt: 1 }, { path: 'author', select: 'name status' });
    return {
      ...res,
      items: res.items.map((c: any) => ({
        id: String(c._id),
        author: { id: String(c.author?._id ?? c.author), name: displayName(c.author) },
        body: c.body,
        hidden: c.hidden,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    };
  }

  async listComments(postId: string, viewer: AuthUser | undefined, page = 1) {
    const p = await this.posts.findById(postId).lean();
    if (!p || !this.canSee(p, viewer)) throw notFound('Post');
    return this.commentsFor(p._id, viewer, page);
  }

  private async publishedVisible(postId: string) {
    const p = await this.posts.findOne({ _id: postId, ...this.publicFilter() });
    if (!p) throw notFound('Post');
    return p;
  }

  async addComment(postId: string, dto: CommentDto, user: AuthUser) {
    const p = await this.publishedVisible(postId);
    const c = await this.comments.create({ post: p._id, author: user.id, body: dto.body });
    await this.refreshCounts(p._id);
    return { id: String(c._id), postId: String(p._id), author: { id: user.id, name: user.name }, body: c.body, createdAt: (c as any).createdAt };
  }

  private async ownComment(id: string, user: AuthUser) {
    const c = await this.comments.findById(id);
    if (!c || String(c.author) !== user.id) throw notFound('Comment');
    return c;
  }

  async updateComment(id: string, dto: CommentDto, user: AuthUser) {
    const c = await this.ownComment(id, user);
    c.body = dto.body;
    await c.save();
    return { id: String(c._id), postId: String(c.post), body: c.body, updatedAt: (c as any).updatedAt };
  }

  async deleteComment(id: string, user: AuthUser) {
    const c = await this.ownComment(id, user);
    await c.deleteOne();
    await this.refreshCounts(c.post);
    return { deleted: true, id };
  }

  // ------------------------------------------------------------------ likes (BLG-06)

  async like(postId: string, user: AuthUser) {
    const p = await this.publishedVisible(postId);
    try {
      await this.likes.create({ post: p._id, user: user.id });
    } catch (e) {
      if (isDuplicateKeyError(e)) throw new ConflictException({ message: 'You have already liked this post' });
      throw e;
    }
    const { likes } = await this.refreshCounts(p._id);
    return { postId: String(p._id), liked: true, likeCount: likes };
  }

  async unlike(postId: string, user: AuthUser) {
    const p = await this.posts.findById(postId);
    if (!p) throw notFound('Post');
    const r = await this.likes.deleteOne({ post: p._id, user: user.id });
    if (!r.deletedCount) throw new BadRequestException({ message: 'You have not liked this post' });
    const { likes } = await this.refreshCounts(p._id);
    return { postId: String(p._id), liked: false, likeCount: likes };
  }

  // ------------------------------------------------------------------ authors (BLG-12)

  async author(id: string, page = 1) {
    const u = await this.users.findById(id).select('name status createdAt role').lean();
    if (!u || u.status === AccountStatus.DEACTIVATED || u.role !== Role.USER) throw notFound('Author');
    const posts = await paginateQuery(this.posts, { author: u._id, ...this.publicFilter() }, page, { publishedAt: -1 });
    return {
      id: String(u._id),
      name: u.name,
      joinedAt: u.createdAt,
      posts: { ...posts, items: posts.items.map((p: any) => this.summary({ ...p, author: u })) },
      publicItineraries: await this.itineraries.publicByAuthor(String(u._id)),
    };
  }
}
