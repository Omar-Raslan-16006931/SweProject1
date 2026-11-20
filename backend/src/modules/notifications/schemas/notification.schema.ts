import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { NotificationType } from '../../../common/enums';

/** GEN-01 in-app notifications. */
@Schema({ collection: 'notifications', timestamps: true })
export class Notification {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true }) user: Types.ObjectId;
  @Prop({ type: String, enum: NotificationType, required: true }) type: NotificationType;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) message: string;
  @Prop({ type: Object }) data?: Record<string, any>;
  @Prop({ type: Date, default: null }) readAt?: Date | null;
}
export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ user: 1, createdAt: -1 });
