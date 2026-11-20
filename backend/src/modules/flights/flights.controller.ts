import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FlightsService } from './flights.service';
import { CabinDto, CreateFlightDto, FlightModeratorListDto, FlightSearchDto, UpdateCabinDto, UpdateFlightDto } from './dto/flight.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@ApiTags('Flights')
@Controller('flights')
export class FlightsController {
  constructor(private readonly service: FlightsService) {}

  @Post()
  @Roles(Role.AIRLINE_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Create a flight for my airline (FLT-03)',
    description: 'Times are entered in each airport\'s local time and stored in UTC. Rejects identical airports, arrival not after departure, past departures and duplicate flight numbers per airline per departure date.',
  })
  create(@Body() dto: CreateFlightDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get('mine')
  @Roles(Role.AIRLINE_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: "List my airline's flights (moderator dashboard support)" })
  mine(@CurrentUser() user: AuthUser, @Query() q: FlightModeratorListDto) {
    return this.service.listForModerator(user, q.page, q.status);
  }

  @Public()
  @Get('search')
  @ApiOperation({
    summary: 'Search flights: one-way / round-trip, passenger types, cabin filter, price filter, sorting (FLT-11, FLT-12, FLT-15)',
  })
  search(@Query() q: FlightSearchDto) {
    return this.service.search(q);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Flight details: local times, duration, cabins, seats remaining, baggage & cancellation policy (FLT-17, GEN-06)' })
  details(@Param('id', ParseObjectIdPipe) id: string) {
    return this.service.details(id);
  }

  @Patch(':id')
  @Roles(Role.AIRLINE_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Edit times (and airports while unbooked) of my Scheduled flight; notifies confirmed passengers (FLT-05)' })
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateFlightDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/cabins')
  @Roles(Role.AIRLINE_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Add a cabin category (Economy / Premium Economy / Business / First, once each) (FLT-04)' })
  addCabin(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CabinDto, @CurrentUser() user: AuthUser) {
    return this.service.addCabin(id, dto, user);
  }

  @Patch(':id/cabins/:cabinId')
  @Roles(Role.AIRLINE_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Edit cabin price, seats (not below booked+held) and baggage allowance (FLT-04, FLT-05)' })
  updateCabin(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('cabinId', ParseObjectIdPipe) cabinId: string,
    @Body() dto: UpdateCabinDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateCabin(id, cabinId, dto, user);
  }
}
