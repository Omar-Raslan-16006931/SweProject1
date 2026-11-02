import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { BookingStatus, PLATFORM_CURRENCY } from '../../../common/enums';
import { PolicyAcceptance, PolicyAcceptanceSchema } from '../../flight-bookings/schemas/flight-booking.schema';

export type HotelReservationDocument = HydratedDocument<HotelReservation>;

/** One reserved room inside a reservation (HTL-16). Price is a snapshot at booking time (HTL-05). */
@Schema()
export class ReservedRoom {
  _id: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Room', required: true }) room: Types.ObjectId;
  @Prop({ required: true }) number: string;
  @Prop({ required: true }) type: string;
  @Prop({ required: true }) beds: number;
  @Prop({ required: true }) maxOccupancy: number;
  @Prop({ required: true }) pricePerNight: number;
  @Prop({ required: true, min: 0 }) adults: number;
  @Prop({ type: [Number], default: [] }) childrenAges: number[];
  @Prop({ required: true }) subtotal: number;
}
const ReservedRoomSchema = SchemaFactory.createForClass(ReservedRoom);

/** Hotel Booking (HTL-16..HTL-21, GEN-11). */
@Schema({ collection: 'hotel_reservations', timestamps: true })
export class HotelReservation {
  @Prop({ unique: true, sparse: true }) reference?: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true }) user: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Hotel', required: true, index: true }) hotel: Types.ObjectId;
  @Prop({ type: String, enum: BookingStatus, default: BookingStatus.PENDING_PAYMENT, index: true }) status: BookingStatus;
  @Prop({ required: true, index: true }) checkIn: Date;
  @Prop({ required: true }) checkOut: Date;
  @Prop({ required: true }) nights: number;
  @Prop({ type: [ReservedRoomSchema], required: true }) rooms: ReservedRoom[];
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
  @Prop() cancelledBy?: 'user' | 'hotel';
}
export const HotelReservationSchema = SchemaFactory.createForClass(HotelReservation);
