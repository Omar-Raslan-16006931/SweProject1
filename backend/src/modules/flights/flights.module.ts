import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Airline, AirlineSchema } from './schemas/airline.schema';
import { Flight, FlightSchema } from './schemas/flight.schema';
import { FlightBooking, FlightBookingSchema } from '../flight-bookings/schemas/flight-booking.schema';
import { AirlinesService } from './airlines.service';
import { FlightsService } from './flights.service';
import { AirlinesController } from './airlines.controller';
import { FlightsController } from './flights.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Airline.name, schema: AirlineSchema },
      { name: Flight.name, schema: FlightSchema },
      { name: FlightBooking.name, schema: FlightBookingSchema },
    ]),
  ],
  controllers: [AirlinesController, FlightsController],
  providers: [AirlinesService, FlightsService],
  exports: [AirlinesService, FlightsService, MongooseModule],
})
export class FlightsModule {}
