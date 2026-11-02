import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** ITN-18: exchange rates fetched once per day and cached in the database. Rates are relative to `base`. */
@Schema({ collection: 'exchange_rates', timestamps: true })
export class ExchangeRate {
  @Prop({ required: true, unique: true }) date: string; // YYYY-MM-DD (rate date reported by the API)
  @Prop({ required: true }) base: string;
  @Prop({ type: Object, required: true }) rates: Record<string, number>;
  @Prop({ required: true }) fetchedAt: Date;
}
export const ExchangeRateSchema = SchemaFactory.createForClass(ExchangeRate);
