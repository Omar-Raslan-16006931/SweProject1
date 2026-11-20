import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HotelBookingsService } from './hotel-bookings.service';
import { HotelBookingRequestDto, HotelReservationsQueryDto } from './dto/hotel-booking.dto';
import { MyBookingsQueryDto } from '../flight-bookings/dto/flight-booking.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@ApiTags('Hotel Bookings')
@ApiCookieAuth('access_token')
@Controller()
export class HotelBookingsController {
  constructor(private readonly service: HotelBookingsService) {}

  @Post('hotel-bookings')
  @Roles(Role.USER)
  @ApiOperation({
    summary: 'Book one or more rooms in the same hotel: holds all rooms together for 10 minutes as one Pending Payment reservation (HTL-16, HTL-18)',
    description: 'All-or-nothing: if any room overlaps a Confirmed reservation, unexpired hold or blocked range, nothing is held. Returns the total price; fetch policies via GET /api/bookings/hotel/:id/policies.',
  })
  create(@Body() dto: HotelBookingRequestDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get('hotel-bookings')
  @Roles(Role.USER)
  @ApiOperation({ summary: 'My hotel reservations grouped as upcoming / past / cancelled (HTL-20)' })
  mine(@CurrentUser() user: AuthUser, @Query() q: MyBookingsQueryDto) {
    return this.service.listMine(user, q.group, q.page);
  }

  @Get('hotel-bookings/:id')
  @Roles(Role.USER, Role.ADMIN, Role.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'Reservation details incl. payment and refund status (HTL-20, PAY-03, ACC-11)' })
  details(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.details(id, user);
  }

  @Get('hotel-bookings/:id/cancellation-preview')
  @Roles(Role.USER)
  @ApiOperation({ summary: "Refund computed from the hotel's tiers on the full total, shown before confirming (HTL-21, HTL-10)" })
  preview(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.cancellationPreview(id, user);
  }

  @Post('hotel-bookings/:id/cancel')
  @Roles(Role.USER)
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel my Confirmed reservation as a whole before check-in; rooms released, refund issued (HTL-21, PAY-03)' })
  cancel(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.cancel(id, user);
  }

  @Get('hotels/:id/reservations')
  @Roles(Role.HOTEL_MODERATOR)
  @ApiOperation({ summary: "Reservations for my hotel: guest, dates, status (HTL-22)" })
  hotelReservations(@Param('id', ParseObjectIdPipe) id: string, @Query() q: HotelReservationsQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.hotelReservations(id, q, user);
  }
}
