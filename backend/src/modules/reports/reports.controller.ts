import { Body, Controller, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './reports.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Reports')
@ApiCookieAuth('access_token')
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Post()
  @Roles(Role.USER)
  @ApiOperation({ summary: 'Report a post, comment, review or itinerary with a reason, at most once per item (GEN-09)' })
  create(@Body() dto: CreateReportDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }
}
