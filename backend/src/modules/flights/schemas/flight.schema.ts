import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { CabinClass, FlightStatus } from '../../../common/enums';

export type FlightDocument = HydratedDocument<Flight>;

/**
 * Cabin Inventory (FLT-04). Counters are updated atomically:
 *   available = seats - booked - held   (FLT-11, FLT-22)
 */
@Schema()
export class Cabin {
  _id: Types.ObjectId;
  @Prop({ type: String, enum: CabinClass, required: true }) class: CabinClass;
  @Prop({ required: true, min: 1 }) seats: number;
  @Prop({ required: true, min: 0.01 }) price: number;
  @Prop({ required: true, min: 0 }) freeBags: number;
  @Prop({ required: true, min: 0 }) maxBagWeightKg: number;
  @Prop({ default: 0, min: 0 }) booked: number;
  @Prop({ default: 0, min: 0 }) held: number;
  @Prop({ required: true, min: 0 }) available: number;
}
export const CabinSchema = SchemaFactory.createForClass(Cabin);

/** Flight (FLT-03, FLT-30). Times stored in UTC; local times derived via airport IANA zones. */
@Schema({ collection: 'flights', timestamps: true })
export class Flight {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Airline', required: true, index: true }) airline: Types.ObjectId;
  @Prop({ required: true, uppercase: true, trim: true }) flightNumber: string;
  @Prop({ required: true, ref: 'Airport' }) departureAirport: string;
  @Prop({ required: true, ref: 'Airport' }) arrivalAirport: string;
  @Prop({ required: true }) departureTime: Date; // UTC
  @Prop({ required: true }) arrivalTime: Date; // UTC
  /** Local calendar date at the departure airport (FLT-11 search key, FLT-03 duplicate rule). */
  @Prop({ required: true }) departureLocalDate: string;
  @Prop({ type: String, enum: FlightStatus, default: FlightStatus.SCHEDULED, index: true }) status: FlightStatus;
  @Prop({ type: [CabinSchema], default: [] }) cabins: Cabin[];
  /** FLT-05: airports are locked once the flight has any booking. */
  @Prop({ default: false }) hasBookings: boolean;
  @Prop() cancelledAt?: Date;
}
export const FlightSchema = SchemaFactory.createForClass(Flight);
FlightSchema.index({ airline: 1, flightNumber: 1, departureLocalDate: 1 }, { unique: true });
FlightSchema.index({ departureAirport: 1, arrivalAirport: 1, departureLocalDate: 1, status: 1 });
