import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsIn, IsMongoId, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AccountStatus, BookingStatus, BookingType, ReportTargetType, Role } from '../../../common/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../../auth/dto/auth.dto';

/** ACC-13 */
export class CreateModeratorDto {
  @ApiProperty({ example: 'Hana Moderator' })
  @IsString() @IsNotEmpty() @MaxLength(100) @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({ example: 'hana.mod@example.com' })
  @IsEmail() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @ApiProperty({ enum: [Role.AIRLINE_MODERATOR, Role.HOTEL_MODERATOR] })
  @IsIn([Role.AIRLINE_MODERATOR, Role.HOTEL_MODERATOR])
  role: Role.AIRLINE_MODERATOR | Role.HOTEL_MODERATOR;

  @ApiProperty({ description: 'Airline id (airline moderator) or hotel id (hotel moderator) - exactly one provider' })
  @IsMongoId()
  providerId: string;

  @ApiProperty({ example: 'TempPass123', description: `Temporary password set by the admin; must be changed at first login. ${PASSWORD_MESSAGE}` })
  @IsString() @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  temporaryPassword: string;
}

/** ACC-14 */
export class AccountsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or email' }) @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ enum: Role }) @IsOptional() @IsEnum(Role) role?: Role;
  @ApiPropertyOptional({ enum: AccountStatus }) @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
}

/** ACC-17 */
export class AdminBookingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BookingType }) @IsOptional() @IsEnum(BookingType) type?: BookingType;
  @ApiPropertyOptional({ enum: BookingStatus }) @IsOptional() @IsEnum(BookingStatus) status?: BookingStatus;
  @ApiPropertyOptional({ example: '2026-12-01', description: 'Travel / check-in date from (inclusive)' })
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @ApiPropertyOptional({ example: '2026-12-31', description: 'Travel / check-in date to (inclusive)' })
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}

export class ReportsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'dismissed', 'hidden', 'deleted', 'all'], default: 'open' })
  @IsOptional() @IsIn(['open', 'dismissed', 'hidden', 'deleted', 'all'])
  status?: string = 'open';
  @ApiPropertyOptional({ enum: ReportTargetType }) @IsOptional() @IsEnum(ReportTargetType) targetType?: ReportTargetType;
}

export class ResolveReportDto {
  @ApiProperty({ enum: ['dismiss', 'hide', 'delete'] }) @IsIn(['dismiss', 'hide', 'delete']) action: 'dismiss' | 'hide' | 'delete';
}

export class ContentVisibilityDto {
  @ApiProperty({ example: true, description: 'true = hide, false = unhide' }) @Type(() => Boolean) @IsBoolean() hidden: boolean;
}

export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'account.suspended' }) @IsOptional() @IsString() action?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() actorId?: string;
  @ApiPropertyOptional({ example: '2026-11-01' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @ApiPropertyOptional({ example: '2026-11-30' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}

export class ProvidersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
}
