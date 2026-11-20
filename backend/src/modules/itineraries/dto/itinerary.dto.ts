import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsIn, IsInt, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString,
  Length, Matches, Max, MaxLength, Min, ValidateIf,
} from 'class-validator';
import { BudgetCategory, CabinClass, Visibility } from '../../../common/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

const trim = ({ value }: any) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: any) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateItineraryDto {
  @ApiProperty({ example: 'Egypt & UAE in 10 days', maxLength: 100 })
  @IsString() @IsNotEmpty() @MaxLength(100) @Transform(trim)
  title: string;

  @ApiProperty({ example: ['EG', 'AE'], description: 'One or more country codes from GET /api/countries' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({ each: true }) @Length(2, 2, { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value.map((v) => String(v).toUpperCase()) : value))
  countries: string[];

  @ApiProperty({ example: '2026-12-20' })
  @Matches(DATE, { message: 'startDate must be YYYY-MM-DD' })
  startDate: string;
}

export class UpdateItineraryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) @Transform(trim)
  title?: string;

  @ApiPropertyOptional({ example: ['EG'] })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({ each: true }) @Length(2, 2, { each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value.map((v) => String(v).toUpperCase()) : value))
  countries?: string[];

  @ApiPropertyOptional({ example: '2026-12-21' })
  @IsOptional() @Matches(DATE, { message: 'startDate must be YYYY-MM-DD' })
  startDate?: string;

  @ApiPropertyOptional({ enum: Visibility, description: 'ITN-20' })
  @IsOptional() @IsEnum(Visibility)
  visibility?: Visibility;
}

export class CreateDayDto {
  @ApiProperty({ example: 'cairo', description: 'City from GET /api/cities' })
  @IsString() @IsNotEmpty()
  cityId: string;

  @ApiPropertyOptional({ example: 'Arrive and rest' })
  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ example: 2, description: '1-based position to insert at (default: append)' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  position?: number;
}

export class UpdateDayDto {
  @ApiPropertyOptional({ example: 'dubai' }) @IsOptional() @IsString() @IsNotEmpty() cityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

/** ITN-08 */
export class ReorderDayDto {
  @ApiProperty() @IsMongoId() dayId: string;
  @ApiProperty({ example: 1, description: 'New 1-based position' }) @Type(() => Number) @IsInt() @Min(1) position: number;
}

export class CreateActivityDto {
  @ApiProperty({ example: 'Giza Pyramids visit' }) @IsString() @IsNotEmpty() @MaxLength(150) @Transform(trim) name: string;
  @ApiPropertyOptional({ example: 'Guided tour' }) @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ example: '09:30', description: 'Optional time HH:mm' })
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time must be HH:mm' })
  time?: string;
  @ApiPropertyOptional({ example: 25, description: 'Optional non-negative cost' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  cost?: number;
  @ApiPropertyOptional({ example: 'USD', description: "Currency of the cost (default: your preferred currency)" })
  @IsOptional() @IsString() @Length(3, 3) @Transform(upper)
  currency?: string;
}

export class UpdateActivityDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) @Transform(trim) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ nullable: true, description: 'HH:mm or null to clear' })
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time must be HH:mm' })
  time?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Non-negative cost or null to clear' })
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsNumber() @Min(0)
  cost?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 3) @Transform(upper) currency?: string;
}

export class CreateBudgetDto {
  @ApiProperty({ enum: BudgetCategory }) @IsEnum(BudgetCategory) category: BudgetCategory;
  @ApiProperty({ example: 40, description: 'Non-negative amount' }) @Type(() => Number) @IsNumber() @Min(0) amount: number;
  @ApiProperty({ example: 'EGP', description: 'Supported currency' }) @IsString() @Length(3, 3) @Transform(upper) currency: string;
  @ApiPropertyOptional({ example: 'Dinner' }) @IsOptional() @IsString() @MaxLength(200) description?: string;
}

export class UpdateBudgetDto {
  @ApiPropertyOptional({ enum: BudgetCategory }) @IsOptional() @IsEnum(BudgetCategory) category?: BudgetCategory;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 3) @Transform(upper) currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) description?: string;
}

export class CreateTransportCostDto {
  @ApiProperty({ example: 'Train' }) @IsString() @IsNotEmpty() @MaxLength(50) @Transform(trim) mode: string;
  @ApiProperty({ example: 'cairo' }) @IsString() @IsNotEmpty() fromCityId: string;
  @ApiProperty({ example: 'dubai' }) @IsString() @IsNotEmpty() toCityId: string;
  @ApiProperty({ example: 150 }) @Type(() => Number) @IsNumber() @Min(0) amount: number;
  @ApiProperty({ example: 'USD' }) @IsString() @Length(3, 3) @Transform(upper) currency: string;
  @ApiProperty({ description: 'Itinerary day id this transport belongs to' }) @IsMongoId() dayId: string;
}

export class UpdateTransportCostDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(50) @Transform(trim) mode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() fromCityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() toCityId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 3) @Transform(upper) currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() dayId?: string;
}

export class CurrencyQueryDto {
  @ApiPropertyOptional({ example: 'EUR', description: 'Display currency (default: your preferred currency, or USD for guests)' })
  @IsOptional() @IsString() @Length(3, 3) @Transform(upper)
  currency?: string;
}

/** ITN-21 */
export class PublicItinerarySearchDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'cairo', description: 'Keyword matching title, country or city' })
  @IsOptional() @IsString() @MaxLength(100)
  keyword?: string;
  @ApiPropertyOptional({ example: 3 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(60) minDays?: number;
  @ApiPropertyOptional({ example: 10 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(60) maxDays?: number;
  @ApiPropertyOptional({ example: 'EG' }) @IsOptional() @IsString() @Length(2, 2) @Transform(upper) countryCode?: string;
  @ApiPropertyOptional({ example: 'cairo' }) @IsOptional() @IsString() cityId?: string;
}

/** ITN-25 */
export class ItineraryHotelSearchDto extends PaginationQueryDto {
  @ApiProperty({ description: 'Id of the first day of the city group (see cityGroups in the itinerary)' }) @IsMongoId() groupStartDayId: string;
  @ApiProperty({ example: 2 }) @Type(() => Number) @IsInt() @Min(1) @Max(50) guests: number;
  @ApiPropertyOptional({ example: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) rooms?: number = 1;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(5) minRating?: number;
  @ApiPropertyOptional({ enum: ['price', 'rating'] }) @IsOptional() @IsIn(['price', 'rating']) sortBy?: 'price' | 'rating' = 'price';
  @ApiPropertyOptional({ enum: ['asc', 'desc'] }) @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc' = 'asc';
}

/** ITN-26 */
export class ItineraryFlightSearchDto extends PaginationQueryDto {
  @ApiProperty({ example: 'JFK', description: 'Origin airport IATA code' })
  @IsString() @Length(3, 3) @Transform(upper)
  origin: string;
  @ApiPropertyOptional({ enum: ['one-way', 'round-trip'], default: 'one-way' })
  @IsOptional() @IsIn(['one-way', 'round-trip'])
  tripType?: 'one-way' | 'round-trip' = 'one-way';
  @ApiPropertyOptional({ example: '2026-12-20', description: 'Defaults to the itinerary start date' })
  @IsOptional() @Matches(DATE) date?: string;
  @ApiPropertyOptional({ example: '2026-12-29', description: "Defaults to the last day's date" })
  @IsOptional() @Matches(DATE) returnDate?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(9) adults?: number = 1;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(9) children?: number = 0;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(9) infants?: number = 0;
  @ApiPropertyOptional({ enum: CabinClass }) @IsOptional() @IsEnum(CabinClass) cabinClass?: CabinClass;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxPrice?: number;
  @ApiPropertyOptional({ enum: ['price', 'duration', 'departureTime'] })
  @IsOptional() @IsIn(['price', 'duration', 'departureTime']) sortBy?: 'price' | 'duration' | 'departureTime' = 'departureTime';
  @ApiPropertyOptional({ enum: ['asc', 'desc'] }) @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc' = 'asc';
}
