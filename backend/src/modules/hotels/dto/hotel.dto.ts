import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Length, Matches,
  Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { CancellationTierDto } from '../../flights/dto/airline.dto';

const trim = ({ value }: any) => (typeof value === 'string' ? value.trim() : value);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateHotelDto {
  @ApiProperty({ example: 'Nile View Hotel' })
  @IsString() @IsNotEmpty() @MaxLength(150) @Transform(trim)
  name: string;

  @ApiProperty({ example: '12 Corniche El Nil' })
  @IsString() @IsNotEmpty() @MaxLength(300) @Transform(trim)
  address: string;

  @ApiProperty({ example: 'cairo', description: 'city_id from GET /api/cities' })
  @IsString() @IsNotEmpty()
  cityId: string;

  @ApiProperty({ example: 'EG', description: 'Country code; must match the city' })
  @IsString() @Length(2, 2) @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  countryCode: string;

  @ApiPropertyOptional({ example: 'Riverside hotel in downtown Cairo.' })
  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @ApiProperty({ example: 4, minimum: 1, maximum: 5 })
  @Type(() => Number) @IsInt() @Min(1) @Max(5)
  starClass: number;

  @ApiPropertyOptional({ example: ['WiFi', 'Pool', 'Breakfast'] })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(50, { each: true })
  amenities?: string[];
}

export class UpdateHotelDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) @Transform(trim) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300) @Transform(trim) address?: string;
  @ApiPropertyOptional({ example: 'cairo' }) @IsOptional() @IsString() @IsNotEmpty() cityId?: string;
  @ApiPropertyOptional({ example: 'EG' })
  @IsOptional() @IsString() @Length(2, 2) @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 5 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) starClass?: number;
  @ApiPropertyOptional({ example: ['WiFi'] })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(50, { each: true })
  amenities?: string[];
}

/** HTL-09 + HTL-10 */
export class HotelPoliciesDto {
  @ApiPropertyOptional({ example: '15:00', description: 'Standard check-in time HH:mm (HTL-09)' })
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'checkInTime must be HH:mm' })
  checkInTime?: string;

  @ApiPropertyOptional({ example: '12:00', description: 'Standard check-out time HH:mm (HTL-09)' })
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'checkOutTime must be HH:mm' })
  checkOutTime?: string;

  @ApiPropertyOptional({ type: [CancellationTierDto], description: 'Cancellation tiers, days before check-in (HTL-10)' })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CancellationTierDto)
  cancellationTiers?: CancellationTierDto[];
}

export class CreateRoomDto {
  @ApiProperty({ example: '101', description: 'Room number/name, unique within the hotel' })
  @IsString() @IsNotEmpty() @MaxLength(50) @Transform(trim)
  number: string;

  @ApiProperty({ example: 'Double' })
  @IsString() @IsNotEmpty() @MaxLength(50) @Transform(trim)
  type: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number) @IsInt() @Min(1)
  beds: number;

  @ApiProperty({ example: 3, description: 'Maximum occupancy (>= 1)' })
  @Type(() => Number) @IsInt() @Min(1)
  maxOccupancy: number;

  @ApiProperty({ example: 95, description: 'Price per night (> 0), platform currency' })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01, { message: 'pricePerNight must be greater than 0' })
  pricePerNight: number;
}

/** HTL-05 / HTL-06 */
export class UpdateRoomDto {
  @ApiPropertyOptional({ example: 2 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) beds?: number;
  @ApiPropertyOptional({ example: 3 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxOccupancy?: number;
  @ApiPropertyOptional({ example: 99 })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01, { message: 'pricePerNight must be greater than 0' })
  pricePerNight?: number;
  @ApiPropertyOptional({ description: 'false = deactivate (excluded from search); rejected if it overlaps active reservations (HTL-06)' })
  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class DateRangeDto {
  @ApiProperty({ example: '2026-12-01', description: 'First night (inclusive), YYYY-MM-DD' })
  @Matches(DATE, { message: 'from must be YYYY-MM-DD' })
  from: string;

  @ApiProperty({ example: '2027-03-31', description: 'Last night (inclusive), YYYY-MM-DD' })
  @Matches(DATE, { message: 'to must be YYYY-MM-DD' })
  to: string;
}

/**
 * PATCH availability (HTL-05, HTL-06): edit or remove an availability range, or add/remove a blocked range.
 */
export class PatchAvailabilityDto {
  @ApiProperty({ enum: ['update', 'remove', 'block', 'unblock'] })
  @IsIn(['update', 'remove', 'block', 'unblock'])
  action: 'update' | 'remove' | 'block' | 'unblock';

  @ApiPropertyOptional({ description: 'Availability range id (update/remove) or block id (unblock)' })
  @IsOptional() @IsMongoId()
  rangeId?: string;

  @ApiPropertyOptional({ example: '2026-12-24', description: 'New first night (update) or first blocked night (block)' })
  @IsOptional() @Matches(DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-26', description: 'New last night (update) or last blocked night (block)' })
  @IsOptional() @Matches(DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ example: 'Maintenance' })
  @IsOptional() @IsString() @MaxLength(200)
  reason?: string;
}

export class AvailabilityQueryDto extends PaginationQueryDto {
  @ApiProperty({ example: '2026-12-01' }) @Matches(DATE, { message: 'from must be YYYY-MM-DD' }) from: string;
  @ApiProperty({ example: '2026-12-14' }) @Matches(DATE, { message: 'to must be YYYY-MM-DD' }) to: string;
}

export class StayQueryDto extends PaginationQueryDto {
  @ApiProperty({ example: '2026-12-20', description: 'Check-in date YYYY-MM-DD' })
  @Matches(DATE, { message: 'checkIn must be YYYY-MM-DD' })
  checkIn: string;

  @ApiProperty({ example: '2026-12-23', description: 'Check-out date YYYY-MM-DD' })
  @Matches(DATE, { message: 'checkOut must be YYYY-MM-DD' })
  checkOut: string;
}

/** HTL-11 / HTL-12 */
export class HotelSearchDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'cairo', description: 'city_id (either cityId or countryCode is required)' })
  @IsOptional() @IsString()
  cityId?: string;

  @ApiPropertyOptional({ example: 'EG' })
  @IsOptional() @IsString() @Length(2, 2) @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  countryCode?: string;

  @ApiProperty({ example: '2026-12-20' }) @Matches(DATE, { message: 'checkIn must be YYYY-MM-DD' }) checkIn: string;
  @ApiProperty({ example: '2026-12-23' }) @Matches(DATE, { message: 'checkOut must be YYYY-MM-DD' }) checkOut: string;

  @ApiProperty({ example: 2, description: 'Number of guests' })
  @Type(() => Number) @IsInt() @Min(1) @Max(50)
  guests: number;

  @ApiPropertyOptional({ example: 1, default: 1, description: 'Number of rooms' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20)
  rooms?: number = 1;

  @ApiPropertyOptional({ example: 50, description: 'Inclusive minimum price per night of the cheapest qualifying room (HTL-12)' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 300 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ example: 4, description: 'Minimum average rating 1-5; unrated hotels are excluded when set (HTL-12)' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ enum: ['price', 'rating'], default: 'price' })
  @IsOptional() @IsIn(['price', 'rating'])
  sortBy?: 'price' | 'rating' = 'price';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';
}
