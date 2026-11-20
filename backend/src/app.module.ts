import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { BookingRegistryModule } from './common/booking/booking-registry';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { RolesGuard } from './modules/auth/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ReferenceModule } from './modules/reference/reference.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { ExchangeRatesModule } from './modules/exchange-rates/exchange-rates.module';
import { FlightsModule } from './modules/flights/flights.module';
import { FlightBookingsModule } from './modules/flight-bookings/flight-bookings.module';
import { HotelsModule } from './modules/hotels/hotels.module';
import { HotelBookingsModule } from './modules/hotel-bookings/hotel-bookings.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ItinerariesModule } from './modules/itineraries/itineraries.module';
import { BlogModule } from './modules/blog/blog.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], envFilePath: ['.env', '../.env'] }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.get<string>('mongodbUri') }),
    }),
    ScheduleModule.forRoot(),
    BookingRegistryModule,
    // cross-cutting
    AuthModule,
    ReferenceModule,
    NotificationsModule,
    AuditModule,
    UploadsModule,
    ExchangeRatesModule,
    // features
    UsersModule,
    FlightsModule,
    FlightBookingsModule,
    HotelsModule,
    HotelBookingsModule,
    ReviewsModule,
    PaymentsModule,
    ItinerariesModule,
    BlogModule,
    ReportsModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
