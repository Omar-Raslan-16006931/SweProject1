import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { FlightBooking, FlightBookingSchema } from '../flight-bookings/schemas/flight-booking.schema';
import { HotelReservation, HotelReservationSchema } from '../hotel-bookings/schemas/hotel-reservation.schema';
import { Post, PostSchema } from '../blog/schemas/blog.schemas';
import { Itinerary, ItinerarySchema } from '../itineraries/schemas/itinerary.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FlightBooking.name, schema: FlightBookingSchema },
      { name: HotelReservation.name, schema: HotelReservationSchema },
      { name: Post.name, schema: PostSchema },
      { name: Itinerary.name, schema: ItinerarySchema },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
