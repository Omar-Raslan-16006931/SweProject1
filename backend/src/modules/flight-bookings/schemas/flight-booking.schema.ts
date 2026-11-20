import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { BookingStatus, CabinClass, PassengerType, PLATFORM_CURRENCY } from '../../../common/enums';

export type FlightBookingDocument = HydratedDocument<FlightBooking>;

@Schema({ _id: false })
export class ExtraBag {
  @Prop({ required: true, min: 0.1 }) weightKg: number;
}
const ExtraBagSchema = SchemaFactory.createForClass(ExtraBag);

/** Passenger (FLT-19, FLT-12 b). */
@Schema()
export class Passenger {
  _id: Types.ObjectId;
  @Prop({ required: true }) fullName: string;
  @Prop({ required: true }) dateOfBirth: Date;
  @Prop({ required: true }) passportNumber: string;
  @Prop({ type: String, enum: PassengerType, required: true }) type: PassengerType;
  @Prop({ type: [ExtraBagSchema], default: [] }) extraBags: ExtraBag[];
}
const PassengerSchema = SchemaFactory.createForClass(Passenger);

/** One flight segment (round trips have two, FLT-12 a). Prices are snapshots at booking time (FLT-05). */
@Schema()
export class Segment {
  _id: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Flight', required: true, index: true }) flight: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Airline', required: true, index: true }) airline: Types.ObjectId;
  @Prop({ required: true }) direction: 'outbound' | 'return';
  @Prop({ required: true }) flightNumber: string;
  @Prop({ required: true }) departureAirport: string;
  @Prop({ required: true }) arrivalAirport: string;
  @Prop({ required: true }) departureTime: Date;
  @Prop({ required: true }) arrivalTime: Date;
  @Prop({ type: String, enum: CabinClass, required: true }) cabinClass: CabinClass;
  @Prop({ required: true }) seatPrice: number;
  @Prop({ required: true }) seats: number; // seats occupied (adults + children)
  @Prop({ required: true }) freeBags: number;
  @Prop({ required: true }) maxBagWeightKg: number;
  @Prop({ default: 0 }) extraBagPrice: number;
  @Prop({ required: true }) fare: number;
  @Prop({ required: true }) baggageFee: number;
}
const SegmentSchema = SchemaFactory.createForClass(Segment);

@Schema({ _id: false })
export class PolicyAcceptance {
  @Prop({ required: true }) acceptedAt: Date;
  @Prop({ type: Object, required: true }) policies: Record<string, any>;
}
export const PolicyAcceptanceSchema = SchemaFactory.createForClass(PolicyAcceptance);

/** Flight Booking (FLT-19..FLT-26, GEN-11). */
@Schema({ collection: 'flight_bookings', timestamps: true })
export class FlightBooking {
  /** Generated on confirmation (FLT-23). */
  @Prop({ unique: true, sparse: true }) reference?: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true }) user: Types.ObjectId;
  @Prop({ type: String, enum: BookingStatus, default: BookingStatus.PENDING_PAYMENT, index: true }) status: BookingStatus;
  @Prop({ required: true }) tripType: 'one-way' | 'round-trip';
  @Prop({ type: [SegmentSchema], required: true }) segments: Segment[];
  @Prop({ type: [PassengerSchema], required: true }) passengers: Passenger[];
  @Prop({ required: true }) fareTotal: number;
  @Prop({ required: true }) baggageTotal: number;
  @Prop({ required: true }) total: number;
  @Prop({ default: PLATFORM_CURRENCY }) currency: string;
  @Prop({ index: true }) holdExpiresAt?: Date;
  @Prop({ type: PolicyAcceptanceSchema, default: null }) policyAcceptance?: PolicyAcceptance | null;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Payment' }) payment?: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Refund' }) refund?: Types.ObjectId;
  @Prop() confirmedAt?: Date;
  @Prop() expiredAt?: Date;
  @Prop() completedAt?: Date;
  @Prop() cancelledAt?: Date;
  @Prop() cancelledBy?: 'user' | 'airline';
  /** First segment departure, for grouping (FLT-25) and the admin date filter (ACC-17). */
  @Prop({ required: true, index: true }) travelDate: Date;
  /** Last segment departure: booking becomes Completed after it (approved assumption #1). */
  @Prop({ required: true }) lastDepartureTime: Date;
}
export const FlightBookingSchema = SchemaFactory.createForClass(FlightBooking);
FlightBookingSchema.index({ 'segments.flight': 1, status: 1 });
