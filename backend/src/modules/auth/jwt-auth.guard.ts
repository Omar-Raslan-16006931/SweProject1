import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ALLOW_PASSWORD_CHANGE_PENDING_KEY, IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY,
} from '../../common/decorators/public.decorator';
import { AccountStatus } from '../../common/enums';
import { User } from '../users/schemas/user.schema';
import { ACCESS_COOKIE, AccessPayload, AuthService } from './auth.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * Global authentication guard (ACC-04, ACC-06, ACC-19, GEN-13).
 * Reads the JWT from the httpOnly access cookie only (never from JS-accessible storage),
 * validates the server-side session (revocation + 30 min inactivity) and the account status.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwt: JwtService,
    private config: ConfigService,
    private auth: AuthService,
    @InjectModel(User.name) private users: Model<User>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, targets);
    const req = ctx.switchToHttp().getRequest();
    const token: string | undefined = req.cookies?.[ACCESS_COOKIE];

    if (isPublic && !optional) return true;
    if (!token) {
      if (isPublic || optional) return true;
      throw new UnauthorizedException({ message: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    try {
      const payload = this.jwt.verify<AccessPayload>(token, { secret: this.config.get('jwt.accessSecret') });
      const alive = await this.auth.touchSession(payload.sid);
      if (!alive) throw new UnauthorizedException({ message: 'Session expired. Please log in again.', code: 'SESSION_EXPIRED' });
      const user = await this.users.findById(payload.sub).lean();
      if (!user) throw new UnauthorizedException({ message: 'Authentication required', code: 'AUTH_REQUIRED' });
      if (user.status === AccountStatus.SUSPENDED) {
        throw new ForbiddenException({ message: 'Account suspended', code: 'ACCOUNT_SUSPENDED' });
      }
      if (user.status === AccountStatus.DEACTIVATED) {
        throw new UnauthorizedException({ message: 'Account deactivated', code: 'ACCOUNT_DEACTIVATED' });
      }
      const authUser: AuthUser = {
        id: String(user._id),
        role: user.role,
        sessionId: payload.sid,
        name: user.name,
        email: user.email,
        airlineId: user.airline ? String(user.airline) : undefined,
        hotelId: user.hotel ? String(user.hotel) : undefined,
        mustChangePassword: !!user.mustChangePassword,
      };
      req.user = authUser;
    } catch (e: any) {
      if (isPublic || optional) return true;
      if (e?.name === 'TokenExpiredError') {
        throw new UnauthorizedException({
          message: 'Access token expired. Call POST /api/auth/refresh to continue the session.',
          code: 'ACCESS_TOKEN_EXPIRED',
        });
      }
      if (e?.getStatus) throw e;
      throw new UnauthorizedException({ message: 'Invalid authentication token', code: 'AUTH_INVALID' });
    }

    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_PENDING_KEY, targets);
    if (req.user.mustChangePassword && !allowPending && !isPublic && !optional) {
      throw new ForbiddenException({
        message: 'You must set a new password before continuing (PATCH /api/auth/change-password)',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
    return true;
  }
}
