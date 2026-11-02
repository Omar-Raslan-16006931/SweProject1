import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { BudgetCategory, Visibility } from '../../../common/enums';

export type ItineraryDocument = HydratedDocument<Itinerary>;

@Schema()
export class ActivityImage {
  _id: Types.ObjectId;
  @Prop({ required: true }) url: string;
  @Prop({ required: true }) filename: string;
}
const ActivityImageSchema = SchemaFactory.createForClass(ActivityImage);

/** Activity (ITN-10, ITN-12). */
@Schema({ timestamps: true })
export class Activity {
  _id: Types.ObjectId;
  @Prop({ required: true, maxlength: 150 }) name: string;
  @Prop({ default: '', maxlength: 2000 }) description: string;
  @Prop({ type: String, default: null }) time?: string | null; // optional HH:mm
  @Prop({ type: Number, default: null, min: 0 }) cost?: number | null; // optional
  @Prop({ type: String, default: null }) currency?: string | null;
  @Prop({ type: [ActivityImageSchema], default: [] }) images: ActivityImage[];
}
const ActivitySchema = SchemaFactory.createForClass(Activity);

/** Budget Entry (ITN-14). */
@Schema({ timestamps: true })
export class BudgetEntry {
  _id: Types.ObjectId;
  @Prop({ type: String, enum: BudgetCategory, required: true }) category: BudgetCategory;
  @Prop({ required: true, min: 0 }) amount: number;
  @Prop({ required: true }) currency: string;
  @Prop({ default: '', maxlength: 200 }) description: string;
}
const BudgetEntrySchema = SchemaFactory.createForClass(BudgetEntry);

/** Itinerary Day (ITN-05). Number and date are derived from position and the itinerary start date. */
@Schema()
export class ItineraryDay {
  _id: Types.ObjectId;
  @Prop({ required: true, ref: 'City' }) cityId: string;
  @Prop({ default: '', maxlength: 2000 }) notes: string;
  @Prop({ type: [ActivitySchema], default: [] }) activities: Activity[];
  @Prop({ type: [BudgetEntrySchema], default: [] }) budgets: BudgetEntry[];
}
const ItineraryDaySchema = SchemaFactory.createForClass(ItineraryDay);

/** Transport Cost (ITN-16): intercity transport, kept separate from day budgets. */
@Schema({ timestamps: true })
export class TransportCost {
  _id: Types.ObjectId;
  @Prop({ required: true, maxlength: 50 }) mode: string;
  @Prop({ required: true, ref: 'City' }) fromCityId: string;
  @Prop({ required: true, ref: 'City' }) toCityId: string;
  @Prop({ required: true, min: 0 }) amount: number;
  @Prop({ required: true }) currency: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) dayId: Types.ObjectId;
}
const TransportCostSchema = SchemaFactory.createForClass(TransportCost);

@Schema({ _id: false })
export class CloneAttribution {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Itinerary' }) itinerary: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' }) author: Types.ObjectId;
  @Prop() authorName: string;
  @Prop() title: string;
}
const CloneAttributionSchema = SchemaFactory.createForClass(CloneAttribution);

/** Itinerary (ITN-01..ITN-21). */
@Schema({ collection: 'itineraries', timestamps: true })
export class Itinerary {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true }) owner: Types.ObjectId;
  @Prop({ required: true, trim: true, maxlength: 100 }) title: string;
  @Prop({ type: [String], required: true }) countries: string[];
  @Prop({ required: true }) startDate: Date;
  @Prop({ type: String, enum: Visibility, default: Visibility.PRIVATE, index: true }) visibility: Visibility;
  @Prop({ type: [ItineraryDaySchema], default: [] }) days: ItineraryDay[];
  @Prop({ type: [TransportCostSchema], default: [] }) transportCosts: TransportCost[];
  @Prop({ default: 0, index: true }) dayCount: number;
  @Prop({ type: CloneAttributionSchema, default: null }) clonedFrom?: CloneAttribution | null;
  /** GEN-10 */
  @Prop({ default: false, index: true }) hidden: boolean;
  /** ACC-12: public itineraries of deactivated users are hidden. */
  @Prop({ default: false, index: true }) authorDeactivated: boolean;
}
export const ItinerarySchema = SchemaFactory.createForClass(Itinerary);
ItinerarySchema.index({ 'days._id': 1 });
ItinerarySchema.index({ 'days.activities._id': 1 });
ItinerarySchema.index({ 'days.budgets._id': 1 });
ItinerarySchema.index({ 'transportCosts._id': 1 });
ItinerarySchema.pre('save', function (next) {
  this.dayCount = this.days.length;
  next();
});
