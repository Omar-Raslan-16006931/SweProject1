import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { FlightBookingsService } from './flight-bookings.service';
import { FlightBookingRequestDto, MyBookingsQueryDto } from './dto/flight-booking.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { renderETicket } from './e-ticket';

@ApiTags('Flight Bookings')
@ApiCookieAuth('access_token')
@Controller('flight-bookings')
export class FlightBookingsController {
  constructor(private readonly service: FlightBookingsService) {}

  @Post()
  @Roles(Role.USER)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Validate passengers & extra baggage and return the booking summary before payment (FLT-19, FLT-21, FLT-12)',
    description: 'Does not reserve seats. Call POST /api/flight-bookings/hold with the same body to proceed to payment.',
  })
  summary(@Body() dto: FlightBookingRequestDto) {
    return this.service.summary(dto);
  }

  @Post('hold')
  @Roles(Role.USER)
  @ApiOperation({
    summary: 'Proceed to payment: atomically hold seats and create a Pending Payment booking for 10 minutes (FLT-22)',
  })
  hold(@Body() dto: FlightBookingRequestDto, @CurrentUser() user: AuthUser) {
    return this.service.hold(dto, user);
  }

  @Get()
  @Roles(Role.USER)
  @ApiOperation({ summary: 'My flight bookings grouped as upcoming / past / cancelled (FLT-25)' })
  mine(@CurrentUser() user: AuthUser, @Query() q: MyBookingsQueryDto) {
    return this.service.listMine(user, q.group, q.page);
  }

  @Get(':id')
  @Roles(Role.USER, Role.ADMIN, Role.AIRLINE_MODERATOR)
  @ApiOperation({ summary: 'Flight booking details incl. payment and refund status (FLT-25, PAY-03, ACC-11)' })
  details(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.details(id, user);
  }

  @Get(':id/cancellation-preview')
  @Roles(Role.USER)
  @ApiOperation({ summary: "Refund amount computed from the airline's tiers, shown before confirming cancellation (FLT-26, FLT-09)" })
  preview(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.cancellationPreview(id, user);
  }

  @Post(':id/cancel')
  @Roles(Role.USER)
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel my Confirmed booking before departure; seats return to inventory and a refund is issued (FLT-26, PAY-03)' })
  cancel(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.cancel(id, user);
  }

  @Get(':id/e-ticket')
  @Roles(Role.USER, Role.ADMIN)
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Download the e-ticket PDF of a Confirmed booking (FLT-23)' })
  async eTicket(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const { view, airlines } = await this.service.eTicketData(id, user);
    const pdf = await renderETicket(view, airlines);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="e-ticket-${view.reference}.pdf"`);
    res.send(pdf);
  }
}

/** Flight-scoped operations that need booking data (FLT-06, FLT-29). */
@ApiTags('Flights')
@ApiCookieAuth('access_token')
@Controller('flights')
export class FlightOperationsController {
  constructor(private readonly service: FlightBookingsService) {}

  @Post(':id/cancel')
  @Roles(Role.AIRLINE_MODERATOR)
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a Scheduled flight: bookings cancelled with 100% refund, holds released, passengers notified (FLT-06)' })
  cancel(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.cancelFlight(id, user);
  }

  @Get(':id/bookings')
  @Roles(Role.AIRLINE_MODERATOR)
  @ApiOperation({ summary: "Flight's bookings with passengers, cabin, seats, status and seats remaining per cabin (FLT-29)" })
  bookings(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.service.flightBookings(id, user, q.page);
  }

  @Get(':id/passengers/export')
  @Roles(Role.AIRLINE_MODERATOR)
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Export the passenger list as CSV (FLT-29)' })
  async export(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const { filename, csv } = await this.service.passengersCsv(id, user);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
