import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReferenceController } from './reference.controller';
import { ReferenceService } from './reference.service';
import {
  Airport, AirportSchema, Attraction, AttractionSchema, City, CitySchema,
  Country, CountrySchema, Currency, CurrencySchema,
} from './schemas/reference.schemas';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Country.name, schema: CountrySchema },
      { name: City.name, schema: CitySchema },
      { name: Airport.name, schema: AirportSchema },
      { name: Currency.name, schema: CurrencySchema },
      { name: Attraction.name, schema: AttractionSchema },
    ]),
  ],
  controllers: [ReferenceController],
  providers: [ReferenceService],
  exports: [ReferenceService, MongooseModule],
})
export class ReferenceModule {}
