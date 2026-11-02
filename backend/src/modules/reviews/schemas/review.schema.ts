import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';

/** Review (HTL-23, HTL-24): one per Completed reservation. */
@Schema({ collection: 'reviews', timestamps: true })
export class Review {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Hotel', required: true, index: true }) hotel: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'HotelReservation', required: true, unique: true }) reservation: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true }) user: Types.ObjectId;
  @Prop({ required: true, min: 1, max: 5 }) rating: number;
  @Prop({ default: '', maxlength: 1000 }) text: string;
  /** GEN-10: hidden content is visible only to its author and admins. */
  @Prop({ default: false, index: true }) hidden: boolean;
}
export const ReviewSchema = SchemaFactory.createForClass(Review);
