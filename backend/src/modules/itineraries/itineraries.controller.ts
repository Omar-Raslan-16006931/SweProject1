import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFiles, UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ItinerariesService } from './itineraries.service';
import {
  CreateActivityDto, CreateBudgetDto, CreateDayDto, CreateItineraryDto, CreateTransportCostDto, CurrencyQueryDto,
  ItineraryFlightSearchDto, ItineraryHotelSearchDto, PublicItinerarySearchDto, ReorderDayDto, UpdateActivityDto,
  UpdateBudgetDto, UpdateDayDto, UpdateItineraryDto, UpdateTransportCostDto,
} from './dto/itinerary.dto';
import { OptionalAuth, Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ImagesInterceptor, imagesBodySchema } from '../uploads/image-upload';

@ApiTags('Itineraries')
@Controller()
export class ItinerariesController {
  constructor(private readonly service: ItinerariesService) {}

  // ---- public (declared first so /itineraries/public/* is not captured by /itineraries/:id)

  @Public()
  @Get('itineraries/public/search')
  @ApiOperation({ summary: 'Search public itineraries by keyword (title/country/city); filter by duration, country, city (ITN-20, ITN-21)' })
  searchPublic(@Query() q: PublicItinerarySearchDto) {
    return this.service.searchPublic(q);
  }

  @OptionalAuth()
  @Get('itineraries/public/:id')
  @ApiOperation({ summary: 'View a public itinerary read-only with author, days, activities and budget (ITN-21)' })
  viewPublic(@Param('id', ParseObjectIdPipe) id: string, @Query() q: CurrencyQueryDto, @CurrentUser() user?: AuthUser) {
    return this.service.viewPublic(id, user, q.currency);
  }

  // ---- owner

  @Post('itineraries')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Create an itinerary (title <= 100, countries, start date); private by default (ITN-01)' })
  create(@Body() dto: CreateItineraryDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get('itineraries')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'My itineraries, most recently updated first (ITN-03)' })
  mine(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.service.listMine(user, q.page);
  }

  @Get('itineraries/:id')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Full details of my itinerary: numbered dated days, city groups, activities, budgets (ITN-03, ITN-09)' })
  get(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.getMine(id, user);
  }

  @Patch('itineraries/:id')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Edit title, countries, start date and visibility Public/Private (ITN-01, ITN-20)' })
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateItineraryDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Delete('itineraries/:id')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Delete my itinerary; clones made by others are unaffected (ITN-01)' })
  remove(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }

  @Post('itineraries/:id/days')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Add a day (city from predefined list, notes); max 60 days (ITN-05)' })
  addDay(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CreateDayDto, @CurrentUser() user: AuthUser) {
    return this.service.addDay(id, dto, user);
  }

  @Patch('itineraries/:id/days/reorder')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Move a day to a new position; days renumbered, dates and groups recalculated (ITN-08)' })
  reorder(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: ReorderDayDto, @CurrentUser() user: AuthUser) {
    return this.service.reorderDay(id, dto, user);
  }

  @Patch('itineraries/:id/days/:dayId')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: "Edit a day's city and notes (ITN-05)" })
  updateDay(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayId', ParseObjectIdPipe) dayId: string,
    @Body() dto: UpdateDayDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateDay(id, dayId, dto, user);
  }

  @Delete('itineraries/:id/days/:dayId')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Delete a day; remaining days renumbered, dates and budget totals recalculated (ITN-07)' })
  deleteDay(@Param('id', ParseObjectIdPipe) id: string, @Param('dayId', ParseObjectIdPipe) dayId: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteDay(id, dayId, user);
  }

  @Post('itineraries/:id/days/:dayId/activities')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Add an activity: name, description, optional time and cost (ITN-10)' })
  addActivity(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayId', ParseObjectIdPipe) dayId: string,
    @Body() dto: CreateActivityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addActivity(id, dayId, dto, user);
  }

  @Patch('activities/:id')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Edit an activity (ITN-10)' })
  updateActivity(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateActivityDto, @CurrentUser() user: AuthUser) {
    return this.service.updateActivity(id, dto, user);
  }

  @Delete('activities/:id')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Delete an activity (ITN-10)' })
  deleteActivity(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteActivity(id, user);
  }

  @Post('activities/:id/images')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @UseInterceptors(ImagesInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiBody(imagesBodySchema)
  @ApiOperation({ summary: 'Attach images to an activity: JPG/PNG <= 5 MB, max 5 (ITN-12, GEN-08)' })
  addImages(@Param('id', ParseObjectIdPipe) id: string, @UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: AuthUser) {
    return this.service.addActivityImages(id, files, user);
  }

  @Delete('activities/:id/images/:imageId')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Remove an activity image (ITN-12)' })
  removeImage(@Param('id', ParseObjectIdPipe) id: string, @Param('imageId', ParseObjectIdPipe) imageId: string, @CurrentUser() user: AuthUser) {
    return this.service.removeActivityImage(id, imageId, user);
  }

  @Post('itineraries/:id/days/:dayId/budgets')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Add a non-negative budget entry (food / accommodation / in-city transport / activities) (ITN-14)' })
  addBudget(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayId', ParseObjectIdPipe) dayId: string,
    @Body() dto: CreateBudgetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addBudget(id, dayId, dto, user);
  }

  @Patch('budgets/:id')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Edit a budget entry (ITN-14)' })
  updateBudget(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateBudgetDto, @CurrentUser() user: AuthUser) {
    return this.service.updateBudget(id, dto, user);
  }

  @Delete('budgets/:id')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Delete a budget entry (ITN-14)' })
  deleteBudget(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteBudget(id, user);
  }

  @Post('itineraries/:id/transport-costs')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Add an intercity transport cost (mode, from-city, to-city, amount, currency, day) (ITN-16)' })
  addTransport(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CreateTransportCostDto, @CurrentUser() user: AuthUser) {
    return this.service.addTransport(id, dto, user);
  }

  @Patch('transport-costs/:id')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Edit a transport cost entry (ITN-16)' })
  updateTransport(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateTransportCostDto, @CurrentUser() user: AuthUser) {
    return this.service.updateTransport(id, dto, user);
  }

  @Delete('transport-costs/:id')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Delete a transport cost entry (ITN-16)' })
  deleteTransport(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteTransport(id, user);
  }

  @Get('itineraries/:id/budget-summary')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Total budget by category, by day and by city group, converted to the preferred (or given) currency with the rate date (ITN-14, ITN-18, ITN-09)',
  })
  budget(@Param('id', ParseObjectIdPipe) id: string, @Query() q: CurrencyQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.budgetSummary(id, user, q.currency);
  }

  @Post('itineraries/:id/clone')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Clone a public itinerary into an independent private copy crediting the author (ITN-21)' })
  clone(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.clone(id, user);
  }

  @Get('itineraries/:id/hotels')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: "Hotels available for a city group's dates, reusing hotel search (ITN-25)" })
  hotels(@Param('id', ParseObjectIdPipe) id: string, @Query() q: ItineraryHotelSearchDto, @CurrentUser() user: AuthUser) {
    return this.service.searchHotels(id, q, user);
  }

  @Get('itineraries/:id/flights')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: "One-way/round-trip flights from an origin to the first day's city; dates default from the itinerary (ITN-26)" })
  flights(@Param('id', ParseObjectIdPipe) id: string, @Query() q: ItineraryFlightSearchDto, @CurrentUser() user: AuthUser) {
    return this.service.searchFlights(id, q, user);
  }
}
