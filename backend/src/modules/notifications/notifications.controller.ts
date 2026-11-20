import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { NotificationsService } from './notifications.service';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

/** GEN-01 list query: page + optional unread-only filter. */
export class NotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'Only unread notifications' })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'unreadOnly must be true or false' })
  unreadOnly?: 'true' | 'false';
}

@ApiTags('Notifications')
@ApiCookieAuth('access_token')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my in-app notifications, newest first (GEN-01, GEN-05)' })
  list(@CurrentUser() user: AuthUser, @Query() q: NotificationsQueryDto) {
    return this.service.list(user.id, q.page, q.unreadOnly === 'true');
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread notification count (GEN-01)' })
  unread(@CurrentUser() user: AuthUser) {
    return this.service.unreadCount(user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all my notifications as read (GEN-01)' })
  readAll(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read (GEN-01)' })
  read(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.service.markRead(user.id, id);
  }
}
