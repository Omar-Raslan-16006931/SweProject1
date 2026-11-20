import {
  ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { Response } from 'express';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Session } from './schemas/session.schema';
import { AccountStatus, Role } from '../../common/enums';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { forbidden } from '../../common/utils/errors';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
const MAX_FAILED_ATTEMPTS = 5; // ACC-05
const LOCK_MINUTES = 15; // ACC-05
const BCRYPT_ROUNDS = 12;

export interface AccessPayload {
  sub: string;
  sid: string;
  role: Role;
}

/** ACC-04: role home page returned after login. */
export const ROLE_HOME: Record<Role, string> = {
  [Role.USER]: '/',
  [Role.ADMIN]: '/admin',
  [Role.AIRLINE_MODERATOR]: '/moderator/airline',
  [Role.HOTEL_MODERATOR]: '/moderator/hotel',
};

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private users: Model<User>,
    @InjectModel(Session.name) private sessions: Model<Session>,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  static hashPassword(plain: string) {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  publicUser(u: UserDocument | any) {
    return {
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      phone: u.phone ?? null,
      preferredCurrency: u.preferredCurrency,
      mustChangePassword: !!u.mustChangePassword,
      airlineId: u.airline ? String(u.airline) : null,
      hotelId: u.hotel ? String(u.hotel) : null,
      createdAt: u.createdAt,
      homePath: ROLE_HOME[u.role as Role],
    };
  }

  /** ACC-01 */
  async register(dto: RegisterDto) {
    const exists = await this.users.exists({ email: dto.email });
    if (exists) {
      throw new ConflictException({
        message: 'This email is already registered',
        errors: [{ field: 'email', messages: ['This email is already registered'] }],
      });
    }
    const user = await this.users.create({
      name: dto.name,
      email: dto.email,
      passwordHash: await AuthService.hashPassword(dto.password),
      role: Role.USER,
      termsAcceptedAt: new Date(),
    });
    return this.publicUser(user);
  }

  /** ACC-04, ACC-05 */
  async login(dto: LoginDto, res: Response, userAgent?: string) {
    const invalid = () => new UnauthorizedException({ message: 'Invalid email or password' });
    const user = await this.users.findOne({ email: dto.email }).select('+passwordHash');
    if (!user) throw invalid();

    const now = new Date();
    if (user.lockUntil && user.lockUntil > now) {
      const mins = Math.ceil((user.lockUntil.getTime() - now.getTime()) / 60000);
      throw new HttpException(
        { message: `Account locked after too many failed attempts. Try again in ${mins} minute(s).`, code: 'ACCOUNT_LOCKED' },
        HttpStatus.LOCKED,
      );
    }

    const lockedError = () =>
      new HttpException(
        { message: `Account locked for ${LOCK_MINUTES} minutes after ${MAX_FAILED_ATTEMPTS} failed login attempts.`, code: 'ACCOUNT_LOCKED' },
        HttpStatus.LOCKED,
      );
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      // ACC-05: atomic counter, so parallel wrong-password requests cannot bypass the lock.
      const counted = await this.users.findOneAndUpdate(
        { _id: user._id },
        { $inc: { failedLoginAttempts: 1 } },
        { new: true, projection: { failedLoginAttempts: 1 } },
      );
      if ((counted?.failedLoginAttempts ?? 0) >= MAX_FAILED_ATTEMPTS) {
        await this.users.updateOne(
          { _id: user._id },
          { $set: { failedLoginAttempts: 0, lockUntil: new Date(Date.now() + LOCK_MINUTES * 60000) } },
        );
        throw lockedError();
      }
      throw invalid();
    }

    if (user.status === AccountStatus.SUSPENDED) {
      throw new ForbiddenException({ message: 'Account suspended', code: 'ACCOUNT_SUSPENDED' });
    }
    if (user.status === AccountStatus.DEACTIVATED) {
      throw new ForbiddenException({ message: 'Account deactivated', code: 'ACCOUNT_DEACTIVATED' });
    }

    // ACC-05: a successful login resets the counter, unless a parallel failure has just locked the account.
    const reset = await this.users.updateOne(
      { _id: user._id, $or: [{ lockUntil: null }, { lockUntil: { $lte: new Date() } }] },
      { $set: { failedLoginAttempts: 0, lastLoginAt: now }, $unset: { lockUntil: 1 } },
    );
    if (!reset.matchedCount) throw lockedError();

    await this.startSession(user, res, userAgent);
    return this.publicUser(user);
  }

  private cookieOptions(maxAgeMs: number) {
    return {
      httpOnly: true,
      secure: this.config.get<boolean>('cookies.secure'),
      sameSite: this.config.get<'lax' | 'strict' | 'none'>('cookies.sameSite'),
      path: '/',
      maxAge: maxAgeMs,
    };
  }

  private inactivityMs() {
    return (this.config.get<number>('session.inactivityMinutes') ?? 30) * 60000;
  }

  private async startSession(user: UserDocument, res: Response, userAgent?: string) {
    const refreshToken = randomBytes(48).toString('base64url');
    const now = new Date();
    const session = await this.sessions.create({
      user: user._id,
      refreshTokenHash: sha256(refreshToken),
      lastActivityAt: now,
      userAgent,
      expiresAt: new Date(now.getTime() + 7 * 86400000),
    });
    this.setCookies(res, user, String(session._id), refreshToken);
  }

  private setCookies(res: Response, user: { _id: any; role: Role }, sid: string, refreshToken: string) {
    const ttl = this.config.get<number>('jwt.accessTtlSeconds') ?? 900;
    const payload: AccessPayload = { sub: String(user._id), sid, role: user.role };
    const access = this.jwt.sign(payload, { secret: this.config.get('jwt.accessSecret'), expiresIn: ttl });
    res.cookie(ACCESS_COOKIE, access, this.cookieOptions(ttl * 1000));
    // Refresh cookie: the server-side session additionally enforces the 30 min inactivity window.
    res.cookie(REFRESH_COOKIE, `${sid}.${refreshToken}`, {
      ...this.cookieOptions(7 * 86400000),
      path: '/api/auth',
    });
  }

  clearCookies(res: Response) {
    const base = {
      httpOnly: true,
      secure: this.config.get<boolean>('cookies.secure'),
      sameSite: this.config.get<'lax' | 'strict' | 'none'>('cookies.sameSite'),
    };
    res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...base, path: '/api/auth' });
  }

  /** ACC-06 */
  async logout(sessionId: string | undefined, res: Response) {
    if (sessionId && Types.ObjectId.isValid(sessionId)) {
      await this.sessions.updateOne({ _id: sessionId }, { $set: { revokedAt: new Date() } });
    }
    this.clearCookies(res);
    return { message: 'Logged out' };
  }

  /** Rotates the refresh token and issues a fresh access token while the session is active. */
  async refresh(rawCookie: string | undefined, res: Response) {
    const fail = () => {
      this.clearCookies(res);
      return new UnauthorizedException({ message: 'Session expired. Please log in again.', code: 'SESSION_EXPIRED' });
    };
    if (!rawCookie || !rawCookie.includes('.')) throw fail();
    const [sid, token] = rawCookie.split('.', 2);
    if (!Types.ObjectId.isValid(sid)) throw fail();
    const session = await this.sessions.findById(sid);
    if (!session || session.revokedAt || session.refreshTokenHash !== sha256(token)) throw fail();
    if (Date.now() - session.lastActivityAt.getTime() > this.inactivityMs()) {
      session.revokedAt = new Date();
      await session.save();
      throw fail();
    }
    const user = await this.users.findById(session.user);
    if (!user || user.status !== AccountStatus.ACTIVE) {
      session.revokedAt = new Date();
      await session.save();
      throw fail();
    }
    const newToken = randomBytes(48).toString('base64url');
    session.refreshTokenHash = sha256(newToken);
    session.lastActivityAt = new Date();
    await session.save();
    this.setCookies(res, user, sid, newToken);
    return this.publicUser(user);
  }

  /** Called by the auth guard on every authenticated request (ACC-06 inactivity). */
  async touchSession(sid: string): Promise<boolean> {
    const session = await this.sessions.findById(sid).lean();
    if (!session || session.revokedAt) return false;
    const idle = Date.now() - new Date(session.lastActivityAt).getTime();
    if (idle > this.inactivityMs()) {
      await this.sessions.updateOne({ _id: sid }, { $set: { revokedAt: new Date() } });
      return false;
    }
    if (idle > 30000) {
      await this.sessions.updateOne({ _id: sid }, { $set: { lastActivityAt: new Date() } });
    }
    return true;
  }

  async me(userId: string) {
    const u = await this.users.findById(userId).lean();
    if (!u) throw new UnauthorizedException({ message: 'Not authenticated' });
    return this.publicUser(u);
  }

  /** ACC-08 (also completes ACC-07a / ACC-13 temporary-password flow). */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.users.findById(userId).select('+passwordHash');
    if (!user) throw new UnauthorizedException({ message: 'Not authenticated' });
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) {
      throw new ForbiddenException({
        message: 'Current password is incorrect',
        errors: [{ field: 'currentPassword', messages: ['Current password is incorrect'] }],
      });
    }
    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new ForbiddenException({
        message: 'New password must be different from the current password',
        errors: [{ field: 'newPassword', messages: ['New password must be different from the current password'] }],
      });
    }
    user.passwordHash = await AuthService.hashPassword(dto.newPassword);
    user.mustChangePassword = false;
    await user.save();
    return { message: 'Password changed' };
  }

  /** Revoke every session of a user (suspension, deactivation, admin password reset). */
  async revokeAllSessions(userId: string | Types.ObjectId) {
    await this.sessions.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }

  assertNotSelf(actorId: string, targetId: string) {
    if (actorId === targetId) throw forbidden('You cannot perform this action on your own account');
  }
}
