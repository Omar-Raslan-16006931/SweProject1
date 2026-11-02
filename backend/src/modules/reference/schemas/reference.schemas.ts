import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * Reference data (GEN-12, FLT-02, PDF 5.1). The official dataset identifiers are
 * used as the document _id so every team uses identical identifiers.
 */
@Schema({ collection: 'countries', versionKey: false })
export class Country {
  @Prop({ type: String }) _id: string; // ISO code, e.g. "EG"
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) currency: string;
}
export const CountrySchema = SchemaFactory.createForClass(Country);

@Schema({ collection: 'cities', versionKey: false })
export class City {
  @Prop({ type: String }) _id: string; // city_id, e.g. "cairo"
  @Prop({ required: true }) name: string;
  @Prop({ required: true, index: true }) countryCode: string;
}
export const CitySchema = SchemaFactory.createForClass(City);

@Schema({ collection: 'airports', versionKey: false })
export class Airport {
  @Prop({ type: String }) _id: string; // IATA code, e.g. "CAI"
  @Prop({ required: true }) name: string;
  @Prop({ required: true, index: true }) cityId: string;
  @Prop({ required: true }) countryCode: string;
  @Prop({ required: true }) timeZone: string; // IANA
}
export const AirportSchema = SchemaFactory.createForClass(Airport);

@Schema({ collection: 'attractions', versionKey: false })
export class Attraction {
  @Prop({ type: String }) _id: string; // attraction_id, e.g. "att-1"
  @Prop({ required: true }) name: string;
  @Prop({ required: true, index: true }) cityId: string;
}
export const AttractionSchema = SchemaFactory.createForClass(Attraction);

@Schema({ collection: 'currencies', versionKey: false })
export class Currency {
  @Prop({ type: String }) _id: string; // ISO 4217 code
  @Prop({ required: true }) name: string;
}
export const CurrencySchema = SchemaFactory.createForClass(Currency);
