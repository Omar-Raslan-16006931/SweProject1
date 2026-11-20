import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AirlinesService } from './airlines.service';
import { BaggagePolicyDto, CancellationPolicyDto, CreateAirlineDto, UpdateAirlineDto } from './dto/airline.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Role } from '../../common/enums';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { LogoInterceptor, logoBodySchema } from '../uploads/image-upload';

@ApiTags('Airlines')
@Controller('airlines')
export class AirlinesController {
  constructor(private readonly service: AirlinesService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Admin creates an airline profile (FLT-01)' })
  create(@Body() dto: CreateAirlineDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Airline profile with baggage and cancellation policies (FLT-01, FLT-17)' })
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.service.findPublic(id);
  }

  @Patch(':id')
  @Roles(Role.AIRLINE_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: "Airline moderator edits their airline's profile: name, code (FLT-01)" })
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateAirlineDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/logo')
  @Roles(Role.AIRLINE_MODERATOR)
  @ApiCookieAuth('access_token')
  @UseInterceptors(LogoInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiBody(logoBodySchema)
  @ApiOperation({ summary: 'Upload/replace the airline logo, JPG/PNG <= 5 MB, 1 per airline (FLT-01, GEN-08)' })
  logo(@Param('id', ParseObjectIdPipe) id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    return this.service.uploadLogo(id, file, user);
  }

  @Delete(':id/logo')
  @Roles(Role.AIRLINE_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Remove the airline logo (FLT-01, GEN-08)' })
  removeLogo(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.removeLogo(id, user);
  }

  @Put(':id/baggage-policy')
  @Roles(Role.AIRLINE_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Set extra-baggage price and max extra bags per passenger (FLT-04, FLT-08)' })
  baggage(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: BaggagePolicyDto, @CurrentUser() user: AuthUser) {
    return this.service.setBaggagePolicy(id, dto, user);
  }

  @Put(':id/cancellation-policy')
  @Roles(Role.AIRLINE_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Replace cancellation tiers: unique days-before thresholds and refund % (FLT-09)' })
  cancellation(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CancellationPolicyDto, @CurrentUser() user: AuthUser) {
    return this.service.setCancellationPolicy(id, dto, user);
  }
}
