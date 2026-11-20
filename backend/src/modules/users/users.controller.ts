import { Body, Controller, Delete, Get, Patch, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/users.dto';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiCookieAuth('access_token')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'My profile (ACC-11)' })
  me(@CurrentUser() user: AuthUser) {
    return this.service.me(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Edit name, phone number and preferred currency (ACC-09)' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.service.update(user, dto);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Deactivate my account; blocked while I have upcoming Confirmed bookings (ACC-12)' })
  deactivate(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    return this.service.deactivate(user, res);
  }
}
