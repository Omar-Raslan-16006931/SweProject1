import { Module } from '@nestjs/common';
import { FlightsModule } from '../flights/flights.module';
import { PaymentsModule } from '../payments/payments.module';
import { FlightBookingsService } from './flight-bookings.service';
import { FlightBookingsController, FlightOperationsController } from './flight-bookings.controller';

@Module({
  imports: [FlightsModule, PaymentsModule],
  controllers: [FlightBookingsController, FlightOperationsController],
  providers: [FlightBookingsService],
  exports: [FlightBookingsService],
})
export class FlightBookingsModule {}
