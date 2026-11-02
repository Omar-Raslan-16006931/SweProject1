import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type SessionDocument = HydratedDocument<Session>;

/**
 * Server-side session backing the refresh token (ACC-06, ACC-19).
 * The refresh token itself is only stored as a SHA-256 hash.
 */
@Schema({ collection: 'sessions', timestamps: true })
export class Session {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true }) user: Types.ObjectId;
  @Prop({ required: true }) refreshTokenHash: string;
  @Prop({ required: true }) lastActivityAt: Date;
  @Prop() revokedAt?: Date;
  @Prop() userAgent?: string;
  /** Mongo TTL cleanup of stale sessions (7 days after last activity window). */
  @Prop({ required: true }) expiresAt: Date;
}
export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
