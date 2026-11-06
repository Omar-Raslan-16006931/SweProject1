import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BlogService } from './blog.service';
import { CommentDto, CreatePostDto, PostListQueryDto, UpdatePostDto } from './dto/blog.dto';
import { OptionalAuth, Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ImagesInterceptor, imagesBodySchema } from '../uploads/image-upload';

@ApiTags('Blog')
@Controller()
export class BlogController {
  constructor(private readonly service: BlogService) {}

  @Post('posts')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Create a post (title, body, optional tags) as Draft or Published (BLG-01, BLG-08)' })
  create(@Body() dto: CreatePostDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Public()
  @Get('posts')
  @ApiOperation({ summary: 'Browse published posts (filter by tag) or search by keyword ordered by likes+comments (BLG-02, BLG-09)' })
  list(@Query() q: PostListQueryDto) {
    return this.service.list(q);
  }

  @Get('posts/mine')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'My posts including drafts with status, date, like and comment counts (BLG-03)' })
  mine(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.service.mine(user, q.page);
  }

  @OptionalAuth()
  @Get('posts/:id')
  @ApiOperation({ summary: 'Post page: title, author, date, body, tags, images, like count and comments (BLG-02)' })
  get(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.service.getOne(id, user);
  }

  @Patch('posts/:id')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Edit my post incl. tags and status (BLG-04, BLG-08)' })
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdatePostDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Delete('posts/:id')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Delete my post (BLG-04)' })
  remove(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }

  @OptionalAuth()
  @Get('posts/:id/comments')
  @ApiOperation({ summary: 'Comments of a post in chronological order (BLG-05)' })
  comments(@Param('id', ParseObjectIdPipe) id: string, @Query() q: PaginationQueryDto, @CurrentUser() user?: AuthUser) {
    return this.service.listComments(id, user, q.page);
  }

  @Post('posts/:id/comments')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Comment on a published post (non-empty, <= 500 chars) (BLG-05)' })
  comment(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CommentDto, @CurrentUser() user: AuthUser) {
    return this.service.addComment(id, dto, user);
  }

  @Patch('comments/:id')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Edit my comment (BLG-07)' })
  updateComment(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CommentDto, @CurrentUser() user: AuthUser) {
    return this.service.updateComment(id, dto, user);
  }

  @Delete('comments/:id')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Delete my comment (BLG-07)' })
  deleteComment(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteComment(id, user);
  }

  @Post('posts/:id/like')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Like a post (once per user) (BLG-06)' })
  like(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.like(id, user);
  }

  @Delete('posts/:id/like')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Remove my like (BLG-06)' })
  unlike(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.unlike(id, user);
  }

  @Post('posts/:id/images')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @UseInterceptors(ImagesInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiBody(imagesBodySchema)
  @ApiOperation({ summary: 'Attach images to my post: JPG/PNG <= 5 MB, max 5 (BLG-10, GEN-08)' })
  images(@Param('id', ParseObjectIdPipe) id: string, @UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: AuthUser) {
    return this.service.addImages(id, files, user);
  }

  @Delete('posts/:id/images/:imageId')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Remove an image from my post (BLG-10)' })
  removeImage(@Param('id', ParseObjectIdPipe) id: string, @Param('imageId', ParseObjectIdPipe) imageId: string, @CurrentUser() user: AuthUser) {
    return this.service.removeImage(id, imageId, user);
  }

  @Public()
  @Get('tags/:tag/posts')
  @ApiOperation({ summary: 'Published posts with a tag (BLG-08)' })
  byTag(@Param('tag') tag: string, @Query() q: PaginationQueryDto) {
    return this.service.byTag(tag, q.page);
  }

  @Public()
  @Get('authors/:id')
  @ApiOperation({ summary: "Public author page: name, join date, published posts and public itineraries (BLG-12)" })
  author(@Param('id', ParseObjectIdPipe) id: string, @Query() q: PaginationQueryDto) {
    return this.service.author(id, q.page);
  }
}
