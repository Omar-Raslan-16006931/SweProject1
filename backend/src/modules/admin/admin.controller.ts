import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import {
  AccountsQueryDto, AdminBookingsQueryDto, AuditQueryDto, ContentVisibilityDto, CreateModeratorDto, ProvidersQueryDto,
  ReportsQueryDto, ResolveReportDto,
} from './dto/admin.dto';
import { TemporaryPasswordDto } from '../auth/dto/auth.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportTargetType, Role } from '../../common/enums';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { ReportsService } from '../reports/reports.service';
import { AuditService } from '../audit/audit.service';
import { parseDateOnly, addDays } from '../../common/utils/dates';
import { BadRequestException } from '@nestjs/common';

function assertType(type: string): ReportTargetType {
  if (!Object.values(ReportTargetType).includes(type as ReportTargetType)) {
    throw new BadRequestException({ message: 'type must be one of post, comment, review, itinerary', field: 'type' });
  }
  return type as ReportTargetType;
}

function assertProviderType(type: string): 'hotel' | 'airline' {
  if (type !== 'hotel' && type !== 'airline') {
    throw new BadRequestException({ message: 'type must be hotel or airline', field: 'type' });
  }
  return type;
}

@ApiTags('Administration')
@ApiCookieAuth('access_token')
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
  ) {}

  @Post('moderators')
  @ApiOperation({ summary: 'Create a hotel or airline moderator linked to exactly one provider, with a temporary password (ACC-13)' })
  createModerator(@Body() dto: CreateModeratorDto, @CurrentUser() admin: AuthUser) {
    return this.service.createModerator(dto, admin);
  }

  @Get('accounts')
  @ApiOperation({ summary: 'Paginated accounts list; search by name/email; filter by role and status (ACC-14)' })
  accounts(@Query() q: AccountsQueryDto) {
    return this.service.accounts(q);
  }

  @Patch('accounts/:id/suspend')
  @ApiOperation({ summary: 'Suspend a user or moderator account (ACC-15, ACC-16)' })
  suspend(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() admin: AuthUser) {
    return this.service.suspend(id, admin);
  }

  @Patch('accounts/:id/reactivate')
  @ApiOperation({ summary: 'Reactivate a suspended user or moderator account (ACC-15, ACC-16)' })
  reactivate(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() admin: AuthUser) {
    return this.service.reactivate(id, admin);
  }

  @Post('users/:id/reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: "Reset a user's or moderator's password to a temporary one; must be changed at next login (ACC-07a)" })
  resetPassword(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: TemporaryPasswordDto, @CurrentUser() admin: AuthUser) {
    return this.service.resetPassword(id, dto.temporaryPassword, admin);
  }

  @Get('airlines')
  @ApiOperation({ summary: 'List airlines with active flag (supports ACC-13 / ACC-15)' })
  airlines(@Query() q: ProvidersQueryDto) {
    return this.service.providers('airline', q.page, q.q);
  }

  @Get('hotels')
  @ApiOperation({ summary: 'List hotels with active flag (supports ACC-13 / ACC-15)' })
  hotels(@Query() q: ProvidersQueryDto) {
    return this.service.providers('hotel', q.page, q.q);
  }

  @Patch('providers/:type/:id/deactivate')
  @ApiParam({ name: 'type', enum: ['hotel', 'airline'] })
  @ApiOperation({ summary: 'Deactivate a hotel or airline: hidden from search and not bookable; existing Confirmed bookings stay valid; affected parties notified (ACC-15)' })
  deactivateProvider(@Param('type') type: string, @Param('id', ParseObjectIdPipe) id: string, @CurrentUser() admin: AuthUser) {
    return this.service.setProviderActive(assertProviderType(type), id, false, admin);
  }

  @Patch('providers/:type/:id/reactivate')
  @ApiParam({ name: 'type', enum: ['hotel', 'airline'] })
  @ApiOperation({ summary: 'Reactivate a deactivated hotel or airline; affected parties notified (ACC-15)' })
  reactivateProvider(@Param('type') type: string, @Param('id', ParseObjectIdPipe) id: string, @CurrentUser() admin: AuthUser) {
    return this.service.setProviderActive(assertProviderType(type), id, true, admin);
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Read-only list of all flight and hotel bookings; filter by type, status, date range (ACC-17)' })
  bookings(@Query() q: AdminBookingsQueryDto) {
    return this.service.bookings(q);
  }

  @Get('reports')
  @ApiOperation({ summary: 'List reports (open by default) (GEN-09, GEN-10)' })
  listReports(@Query() q: ReportsQueryDto) {
    return this.reports.list(q.page, q.status, q.targetType);
  }

  @Patch('reports/:id')
  @ApiOperation({ summary: 'Resolve a report: dismiss, hide the content or delete it (audited) (GEN-10, GEN-07)' })
  resolve(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: ResolveReportDto, @CurrentUser() admin: AuthUser) {
    return this.reports.resolve(id, dto.action, admin);
  }

  @Patch('content/:type/:id/visibility')
  @ApiParam({ name: 'type', enum: ReportTargetType })
  @ApiOperation({ summary: 'Hide or unhide any post, comment, review or itinerary directly (GEN-10)' })
  visibility(
    @Param('type') type: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ContentVisibilityDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.reports.setHidden(assertType(type), id, dto.hidden, admin);
  }

  @Delete('content/:type/:id')
  @ApiParam({ name: 'type', enum: ReportTargetType })
  @ApiOperation({ summary: 'Delete any post, comment, review or itinerary directly (audited) (GEN-10, GEN-07)' })
  deleteContent(@Param('type') type: string, @Param('id', ParseObjectIdPipe) id: string, @CurrentUser() admin: AuthUser) {
    return this.reports.deleteContent(assertType(type), id, admin);
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Audit log of admin actions, newest first (GEN-07)' })
  auditLogs(@Query() q: AuditQueryDto) {
    if (q.from && q.to && parseDateOnly(q.from, 'from') > parseDateOnly(q.to, 'to')) {
      throw new BadRequestException({ message: '"from" cannot be after "to"', field: 'from' });
    }
    return this.audit.list({
      page: q.page,
      action: q.action,
      actorId: q.actorId,
      from: q.from ? parseDateOnly(q.from, 'from') : undefined,
      to: q.to ? addDays(parseDateOnly(q.to, 'to'), 1) : undefined,
    });
  }
}
