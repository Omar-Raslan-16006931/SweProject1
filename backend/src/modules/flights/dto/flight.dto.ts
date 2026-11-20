import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { CabinClass } from '../../../common/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CabinDto {
  @ApiProperty({ enum: CabinClass, example: CabinClass.ECONOMY })
  @IsEnum(CabinClass)
  class: CabinClass;

  @ApiProperty({ example: 150, description: 'Seat count, whole number > 0' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seats: number;

  @ApiProperty({ example: 220, description: 'Price per seat (> 0), platform currency' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'price must be greater than 0' })
  price: number;

  @ApiProperty({ example: 1, description: 'Free baggage allowance (bag count)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  freeBags: number;

  @ApiProperty({ example: 23, description: 'Maximum weight (kg) per bag' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxBagWeightKg: number;
}

export class UpdateCabinDto {
  @ApiPropertyOptional({ example: 160 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seats?: number;

  @ApiPropertyOptional({ example: 199 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'price must be greater than 0' })
  price?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  freeBags?: number;

  @ApiPropertyOptional({ example: 23 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxBagWeightKg?: number;
}

const LOCAL_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const LOCAL_DT_MSG = 'must be a local date-time in the airport time zone (YYYY-MM-DDTHH:mm)';

export class CreateFlightDto {
  @ApiProperty({ example: 'NP101' })
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,8}$/, { message: 'flightNumber must be 2-8 letters or digits' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  flightNumber: string;

  @ApiProperty({ example: 'CAI', description: 'IATA code from GET /api/airports' })
  @IsString()
  @Length(3, 3)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  departureAirport: string;

  @ApiProperty({ example: 'DXB' })
  @IsString()
  @Length(3, 3)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  arrivalAirport: string;

  @ApiProperty({ example: '2026-12-20T08:30', description: 'Local time at the departure airport' })
  @Matches(LOCAL_DT, { message: `departureLocal ${LOCAL_DT_MSG}` })
  departureLocal: string;

  @ApiProperty({ example: '2026-12-20T13:00', description: 'Local time at the arrival airport' })
  @Matches(LOCAL_DT, { message: `arrivalLocal ${LOCAL_DT_MSG}` })
  arrivalLocal: string;

  @ApiPropertyOptional({ type: [CabinDto], description: 'Optional initial cabins (can also be added via POST /flights/:id/cabins)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CabinDto)
  cabins?: CabinDto[];
}

export class UpdateFlightDto {
  @ApiPropertyOptional({ example: 'CAI', description: 'Only while the flight has no bookings (FLT-05)' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  departureAirport?: string;

  @ApiPropertyOptional({ example: 'DXB', description: 'Only while the flight has no bookings (FLT-05)' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  arrivalAirport?: string;

  @ApiPropertyOptional({ example: '2026-12-20T09:00' })
  @IsOptional()
  @Matches(LOCAL_DT, { message: `departureLocal ${LOCAL_DT_MSG}` })
  departureLocal?: string;

  @ApiPropertyOptional({ example: '2026-12-20T13:30' })
  @IsOptional()
  @Matches(LOCAL_DT, { message: `arrivalLocal ${LOCAL_DT_MSG}` })
  arrivalLocal?: string;
}

/** FLT-11, FLT-12, FLT-15 */
export class FlightSearchDto extends PaginationQueryDto {
  @ApiProperty({ example: 'CAI', description: 'Departure airport IATA code' })
  @IsString()
  @Length(3, 3)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  from: string;

  @ApiProperty({ example: 'DXB', description: 'Arrival airport IATA code' })
  @IsString()
  @Length(3, 3)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  to: string;

  @ApiProperty({ example: '2026-12-20', description: 'Departure date (local date at the departure airport)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @ApiPropertyOptional({ enum: ['one-way', 'round-trip'], default: 'one-way' })
  @IsOptional()
  @IsIn(['one-way', 'round-trip'])
  tripType?: 'one-way' | 'round-trip' = 'one-way';

  @ApiPropertyOptional({ example: '2026-12-27', description: 'Required for round-trip (local date at the return departure airport)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'returnDate must be YYYY-MM-DD' })
  returnDate?: string;

  @ApiPropertyOptional({ example: 1, default: 1, description: 'Adults (12+)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  adults?: number = 1;

  @ApiPropertyOptional({ example: 0, default: 0, description: 'Children (2-11)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  children?: number = 0;

  @ApiPropertyOptional({ example: 0, default: 0, description: 'Infants (<2), occupy no seat, max one per adult' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  infants?: number = 0;

  @ApiPropertyOptional({ enum: CabinClass, description: 'Optional cabin-class filter (FLT-12 c)' })
  @IsOptional()
  @IsEnum(CabinClass)
  cabinClass?: CabinClass;

  @ApiPropertyOptional({ example: 100, description: 'Inclusive minimum seat price (FLT-15)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 500, description: 'Inclusive maximum seat price (FLT-15)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: ['price', 'duration', 'departureTime'], default: 'departureTime' })
  @IsOptional()
  @IsIn(['price', 'duration', 'departureTime'])
  sortBy?: 'price' | 'duration' | 'departureTime' = 'departureTime';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';
}

export class FlightModeratorListDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['Scheduled', 'Cancelled', 'Departed'] })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @IsNotEmpty()
  status?: string;
}
