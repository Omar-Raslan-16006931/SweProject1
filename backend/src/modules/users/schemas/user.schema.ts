import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { AccountStatus, PLATFORM_CURRENCY, Role } from '../../../common/enums';

export type UserDocument = HydratedDocument<User>;

/** User Account + Moderator Assignment (PDF 5, ACC-*). */
@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ required: true, trim: true, maxlength: 100 }) name: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) email: string;
  /** GEN-13: salted bcrypt hash only. Never selected by default. */
  @Prop({ required: true, select: false }) passwordHash: string;
  @Prop({ type: String, enum: Role, default: Role.USER, index: true }) role: Role;
  @Prop({ type: String, enum: AccountStatus, default: AccountStatus.ACTIVE, index: true }) status: AccountStatus;
  @Prop({ trim: true }) phone?: string;
  @Prop({ default: PLATFORM_CURRENCY }) preferredCurrency: string;
  @Prop() termsAcceptedAt?: Date;

  // ACC-05 lockout
  @Prop({ default: 0 }) failedLoginAttempts: number;
  @Prop() lockUntil?: Date;

  // ACC-07a / ACC-13 temporary password
  @Prop({ default: false }) mustChangePassword: boolean;

  // ACC-13 moderator assignment: exactly one provider
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Airline', index: true }) airline?: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Hotel', index: true }) hotel?: Types.ObjectId;

  @Prop() lastLoginAt?: Date;
  @Prop() suspendedAt?: Date;
  @Prop() deactivatedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ name: 'text', email: 'text' });

/** Display name used for comments / reviews of deactivated users (ACC-12). */
export function displayName(u: { name?: string; status?: AccountStatus } | null | undefined): string {
  if (!u) return 'Deleted user';
  return u.status === AccountStatus.DEACTIVATED ? 'Deleted user' : (u.name as string);
}
