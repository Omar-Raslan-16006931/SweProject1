import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsIn, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Matches,
  MaxLength, Min, ValidateNested,
} from 'class-validator';
import { CabinClass, PassengerType } from '../../../common/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class ExtraBagDto {
  @ApiProperty({ example: 20, description: "Bag weight in kg, must not exceed the cabin's maximum weight per bag (FLT-08)" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  weightKg: number;
}

export class PassengerDto {
  @ApiProperty({ example: 'Sara Ali' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Matches(/^(?=.*\p{L})[\p{L}\p{M}\p{N} .'\-]+$/u, { message: 'fullName must contain letters (digits only or symbols are not a name)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName: string;

  @ApiProperty({ example: '1995-04-12', description: 'YYYY-MM-DD; validated against the passenger type (FLT-12 b)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must be YYYY-MM-DD' })
  dateOfBirth: string;

  @ApiProperty({ example: 'A12345678' })
  @IsString()
  @Matches(/^[A-Za-z0-9]{5,20}$/, { message: 'passportNumber must be 5-20 letters or digits' })
  passportNumber: string;

  @ApiProperty({ enum: PassengerType, example: PassengerType.ADULT })
  @IsEnum(PassengerType)
  type: PassengerType;

  @ApiPropertyOptional({ type: [ExtraBagDto], description: "Optional extra bags, up to the airline's maximum (FLT-19)" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ExtraBagDto)
  extraBags?: ExtraBagDto[];
}

/** FLT-19 / FLT-21 / FLT-22 / FLT-12 */
export class FlightBookingRequestDto {
  @ApiProperty({ description: 'Outbound flight id (from search results)' })
  @IsMongoId()
  outboundFlightId: string;

  @ApiProperty({ enum: CabinClass })
  @IsEnum(CabinClass)
  outboundCabinClass: CabinClass;

  @ApiPropertyOptional({ description: 'Return flight id for a round trip (one booking, two segments, FLT-12 a)' })
  @IsOptional()
  @IsMongoId()
  returnFlightId?: string;

  @ApiPropertyOptional({ enum: CabinClass })
  @IsOptional()
  @IsEnum(CabinClass)
  returnCabinClass?: CabinClass;

  @ApiProperty({ type: [PassengerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(18)
  @ValidateNested({ each: true })
  @Type(() => PassengerDto)
  passengers: PassengerDto[];
}

export class MyBookingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['upcoming', 'past', 'cancelled'], default: 'upcoming', description: 'FLT-25 / HTL-20 grouping' })
  @IsOptional()
  @IsIn(['upcoming', 'past', 'cancelled'])
  group?: 'upcoming' | 'past' | 'cancelled' = 'upcoming';
}
