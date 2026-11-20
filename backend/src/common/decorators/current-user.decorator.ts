import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '../enums';

export interface AuthUser {
  id: string;
  role: Role;
  sessionId: string;
  name: string;
  email: string;
  airlineId?: string;
  hotelId?: string;
  mustChangePassword: boolean;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
