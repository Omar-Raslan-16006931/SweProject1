import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AirlineDocument = HydratedDocument<Airline>;

@Schema({ _id: false })
export class CancellationTierDoc {
  @Prop({ required: true, min: 0 }) daysBefore: number;
  @Prop({ required: true, min: 0, max: 100 }) refundPercent: number;
}
export const CancellationTierSchema = SchemaFactory.createForClass(CancellationTierDoc);

/** FLT-08 */
@Schema({ _id: false })
export class BaggagePolicy {
  @Prop({ type: Number, default: null }) extraBagPrice: number | null; // > 0 when defined
  @Prop({ default: 0, min: 0 }) maxExtraBags: number; // >= 0
}
export const BaggagePolicySchema = SchemaFactory.createForClass(BaggagePolicy);

@Schema({ _id: false })
export class StoredImageDoc {
  @Prop({ required: true }) url: string;
  @Prop({ required: true }) filename: string;
}
export const StoredImageSchema = SchemaFactory.createForClass(StoredImageDoc);

/** Airline + Airline Policy (PDF 5, FLT-01, FLT-08, FLT-09, ACC-15). */
@Schema({ collection: 'airlines', timestamps: true })
export class Airline {
  @Prop({ required: true, trim: true, maxlength: 100 }) name: string;
  @Prop({ required: true, unique: true, uppercase: true, trim: true }) code: string;
  @Prop({ type: StoredImageSchema, default: null }) logo?: StoredImageDoc | null;
  /** ACC-15: deactivated providers are hidden from search and cannot be booked. */
  @Prop({ default: true, index: true }) active: boolean;
  @Prop({ type: BaggagePolicySchema, default: () => ({ extraBagPrice: null, maxExtraBags: 0 }) }) baggagePolicy: BaggagePolicy;
  @Prop({ type: [CancellationTierSchema], default: [] }) cancellationTiers: CancellationTierDoc[];
}
export const AirlineSchema = SchemaFactory.createForClass(Airline);
