import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { BookingType, PaymentStatus, RefundStatus } from '../../../common/enums';

/**
 * PAY-01: only the Stripe payment ID, amount, currency and status are stored
 * (plus the owning user/booking references). No card data ever reaches the backend.
 */
@Schema({ collection: 'payments', timestamps: true })
export class Payment {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true }) user: Types.ObjectId;
  @Prop({ type: String, enum: BookingType, required: true }) bookingType: BookingType;
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) booking: Types.ObjectId;
  @Prop({ required: true, unique: true }) stripePaymentIntentId: string;
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) currency: string;
  @Prop({ type: String, enum: PaymentStatus, default: PaymentStatus.REQUIRES_PAYMENT }) status: PaymentStatus;
  /** True while the payment can still be completed (requires_payment / processing). */
  @Prop({ default: true }) active: boolean;
}
export const PaymentSchema = SchemaFactory.createForClass(Payment);
/** PAY-01: at most one open PaymentIntent per booking, even when "Pay" is clicked many times at once. */
PaymentSchema.index({ bookingType: 1, booking: 1 }, { unique: true, partialFilterExpression: { active: true }, name: 'one_active_payment_per_booking' });
PaymentSchema.pre('save', function () {
  this.active = this.status === PaymentStatus.REQUIRES_PAYMENT || this.status === PaymentStatus.PROCESSING;
});

/** PAY-03 refund record. */
@Schema({ collection: 'refunds', timestamps: true })
export class Refund {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Payment', required: true, index: true }) payment: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true }) user: Types.ObjectId;
  @Prop({ type: String, enum: BookingType, required: true }) bookingType: BookingType;
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) booking: Types.ObjectId;
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) percent: number;
  @Prop({ required: true }) currency: string;
  @Prop({ index: true }) stripeRefundId?: string;
  @Prop({ type: String, enum: RefundStatus, default: RefundStatus.PENDING }) status: RefundStatus;
  @Prop({ required: true }) reason: string;
}
export const RefundSchema = SchemaFactory.createForClass(Refund);
