import { Module } from '@nestjs/common';
import { HotelsModule } from '../hotels/hotels.module';
import { PaymentsModule } from '../payments/payments.module';
import { HotelBookingsService } from './hotel-bookings.service';
import { HotelBookingsController } from './hotel-bookings.controller';

@Module({
  imports: [HotelsModule, PaymentsModule],
  controllers: [HotelBookingsController],
  providers: [HotelBookingsService],
  exports: [HotelBookingsService],
})
export class HotelBookingsModule {}
