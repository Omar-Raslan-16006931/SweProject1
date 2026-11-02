import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { ReportStatus, ReportTargetType } from '../../../common/enums';

/** GEN-09 / GEN-10 content report. */
@Schema({ collection: 'reports', timestamps: true })
export class Report {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true }) reporter: Types.ObjectId;
  @Prop({ type: String, enum: ReportTargetType, required: true }) targetType: ReportTargetType;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) targetId: Types.ObjectId;
  @Prop({ required: true, maxlength: 500 }) reason: string;
  @Prop({ type: String, enum: ReportStatus, default: ReportStatus.OPEN, index: true }) status: ReportStatus;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' }) resolvedBy?: Types.ObjectId;
  @Prop() resolvedAt?: Date;
}
export const ReportSchema = SchemaFactory.createForClass(Report);
ReportSchema.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true });
ReportSchema.index({ targetType: 1, targetId: 1 });
