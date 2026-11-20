import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Hotel, HotelSchema, Room, RoomNightLock, RoomNightLockSchema, RoomSchema } from './schemas/hotel.schema';
import { HotelReservation, HotelReservationSchema } from '../hotel-bookings/schemas/hotel-reservation.schema';
import { Review, ReviewSchema } from '../reviews/schemas/review.schema';
import { HotelsService } from './hotels.service';
import { HotelsController } from './hotels.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Hotel.name, schema: HotelSchema },
      { name: Room.name, schema: RoomSchema },
      { name: RoomNightLock.name, schema: RoomNightLockSchema },
      { name: HotelReservation.name, schema: HotelReservationSchema },
      { name: Review.name, schema: ReviewSchema },
    ]),
  ],
  controllers: [HotelsController],
  providers: [HotelsService],
  exports: [HotelsService, MongooseModule],
})
export class HotelsModule {}
