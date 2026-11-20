import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService, REFRESH_COOKIE } from './auth.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { AllowPasswordChangePending, OptionalAuth, Public } from '../../common/decorators/public.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new traveler account (ACC-01)' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Log in; sets httpOnly access/refresh cookies (ACC-04, ACC-05, ACC-19)',
    description: 'Returns the profile and the role home path. 5 consecutive failures lock the account for 15 minutes.',
  })
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response, @Req() req: Request) {
    return this.auth.login(dto, res, req.headers['user-agent']);
  }

  @OptionalAuth()
  @AllowPasswordChangePending()
  @Post('logout')
  @HttpCode(200)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Log out: clears cookies and revokes the refresh token server-side (ACC-06)' })
  logout(@CurrentUser() user: AuthUser | undefined, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    let sid = user?.sessionId;
    const raw: string | undefined = req.cookies?.[REFRESH_COOKIE];
    if (!sid && raw?.includes('.')) sid = raw.split('.')[0];
    return this.auth.logout(sid, res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate refresh token and issue a new access cookie while the session is active (ACC-06, ACC-19)' })
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req.cookies?.[REFRESH_COOKIE], res);
  }

  @Get('me')
  @AllowPasswordChangePending()
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Current authenticated user (ACC-04, ACC-19)' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Patch('change-password')
  @AllowPasswordChangePending()
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Change password with the current password (ACC-08; completes ACC-07a/ACC-13 temporary password)' })
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto);
  }
}
