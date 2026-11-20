import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';

/** GEN-07: audit log of admin actions. Append-only. */
@Schema({ collection: 'audit_logs', timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true }) actor: Types.ObjectId;
  @Prop({ required: true, index: true }) action: string;
  @Prop({ required: true }) targetType: string;
  @Prop({ required: true }) targetId: string;
  @Prop({ type: Object }) details?: Record<string, any>;
}
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ createdAt: -1 });
