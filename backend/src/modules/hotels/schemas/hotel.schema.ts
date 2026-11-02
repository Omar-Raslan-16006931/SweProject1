import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { CancellationTierDoc, CancellationTierSchema } from '../../flights/schemas/airline.schema';

export type HotelDocument = HydratedDocument<Hotel>;

@Schema()
export class HotelPhoto {
  _id: Types.ObjectId;
  @Prop({ required: true }) url: string;
  @Prop({ required: true }) filename: string;
}
const HotelPhotoSchema = SchemaFactory.createForClass(HotelPhoto);

/** Hotel + Hotel Policy (HTL-01, HTL-09, HTL-10, ACC-15). */
@Schema({ collection: 'hotels', timestamps: true })
export class Hotel {
  @Prop({ required: true, trim: true, maxlength: 150 }) name: string;
  @Prop({ required: true, trim: true, maxlength: 300 }) address: string;
  @Prop({ required: true, index: true, ref: 'City' }) cityId: string;
  @Prop({ required: true, index: true, ref: 'Country' }) countryCode: string;
  @Prop({ default: '', maxlength: 5000 }) description: string;
  @Prop({ type: [HotelPhotoSchema], default: [] }) photos: HotelPhoto[];
  @Prop({ required: true, min: 1, max: 5 }) starClass: number;
  @Prop({ type: [String], default: [] }) amenities: string[];
  @Prop({ default: '15:00' }) checkInTime: string;
  @Prop({ default: '12:00' }) checkOutTime: string;
  @Prop({ type: [CancellationTierSchema], default: [] }) cancellationTiers: CancellationTierDoc[];
  @Prop({ default: true, index: true }) active: boolean;
  /** HTL-23 / HTL-24: recalculated whenever a review is created, edited, deleted or hidden. */
  @Prop({ type: Number, default: null }) avgRating: number | null;
  @Prop({ default: 0 }) ratingsCount: number;
}
export const HotelSchema = SchemaFactory.createForClass(Hotel);

@Schema()
export class DateRange {
  _id: Types.ObjectId;
  @Prop({ required: true }) from: Date; // inclusive night
  @Prop({ required: true }) to: Date; // inclusive night
  @Prop() reason?: string;
}
const DateRangeSchema = SchemaFactory.createForClass(DateRange);

export type RoomDocument = HydratedDocument<Room>;

/** Room: an individually bookable unit (HTL-03..HTL-06). */
@Schema({ collection: 'rooms', timestamps: true })
export class Room {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Hotel', required: true, index: true }) hotel: Types.ObjectId;
  @Prop({ required: true, trim: true, maxlength: 50 }) number: string;
  @Prop({ required: true, trim: true, maxlength: 50 }) type: string;
  @Prop({ required: true, min: 1 }) beds: number;
  @Prop({ required: true, min: 1 }) maxOccupancy: number;
  @Prop({ required: true, min: 0.01 }) pricePerNight: number;
  @Prop({ default: true }) active: boolean;
  /** HTL-04: non-overlapping date ranges (nights) when the room is bookable. */
  @Prop({ type: [DateRangeSchema], default: [] }) availability: DateRange[];
  /** HTL-06: blocked date ranges (each night is also locked in room_night_locks). */
  @Prop({ type: [DateRangeSchema], default: [] }) blocks: DateRange[];
  /** HTL-06: deletion is allowed only for rooms that have never been reserved. */
  @Prop({ default: false }) everReserved: boolean;
}
export const RoomSchema = SchemaFactory.createForClass(Room);
RoomSchema.index({ hotel: 1, number: 1 }, { unique: true });

/**
 * One document per (room, night). The unique index makes overlapping reservations,
 * holds and blocks impossible even under concurrent requests (HTL-16, HTL-18, HTL-06).
 */
@Schema({ collection: 'room_night_locks', timestamps: { createdAt: true, updatedAt: false } })
export class RoomNightLock {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Room', required: true }) room: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Hotel', required: true, index: true }) hotel: Types.ObjectId;
  @Prop({ required: true }) date: Date;
  @Prop({ required: true, enum: ['reservation', 'block'] }) kind: 'reservation' | 'block';
  @Prop({ type: SchemaTypes.ObjectId, ref: 'HotelReservation', index: true }) reservation?: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId }) block?: Types.ObjectId;
  /** Set for unpaid holds; null once confirmed. Expired holds no longer count as occupying. */
  @Prop({ type: Date, default: null }) expiresAt?: Date | null;
}
export const RoomNightLockSchema = SchemaFactory.createForClass(RoomNightLock);
RoomNightLockSchema.index({ room: 1, date: 1 }, { unique: true });
