import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, UpdateReviewDto } from './reviews.dto';
import { OptionalAuth } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

@ApiTags('Hotel Reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  @Post('hotel-bookings/:id/review')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Submit one rating (1-5) and optional review (<= 1000 chars) for a Completed reservation (HTL-23)' })
  create(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CreateReviewDto, @CurrentUser() user: AuthUser) {
    return this.service.create(id, dto, user);
  }

  @Patch('reviews/:id')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Edit my review; hotel average recalculated (HTL-23)' })
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateReviewDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Delete('reviews/:id')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Delete my review; hotel average recalculated (HTL-23)' })
  remove(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }

  @OptionalAuth()
  @Get('hotels/:id/reviews')
  @ApiOperation({ summary: "Hotel's average rating, number of ratings and reviews, newest first, paginated (HTL-24)" })
  list(@Param('id', ParseObjectIdPipe) id: string, @Query() q: PaginationQueryDto, @CurrentUser() user?: AuthUser) {
    return this.service.forHotel(id, q.page, user);
  }
}
