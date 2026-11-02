import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@ApiTags('Notifications')
@ApiCookieAuth('access_token')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my in-app notifications, newest first (GEN-01, GEN-05)' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  list(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto, @Query('unreadOnly') unreadOnly?: string) {
    return this.service.list(user.id, q.page, unreadOnly === 'true');
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
