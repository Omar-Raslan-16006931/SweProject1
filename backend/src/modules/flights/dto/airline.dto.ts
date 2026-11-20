import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { LIMITS } from '../../../common/enums';
import {
  ArrayUnique, IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class CreateAirlineDto {
  @ApiProperty({ example: 'Nile Air' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({ example: 'NP', description: '2-3 character airline code (letters/digits)' })
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,3}$/, { message: 'code must be 2-3 letters or digits' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  code: string;
}

export class UpdateAirlineDto {
  @ApiPropertyOptional({ example: 'Nile Air' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @ApiPropertyOptional({ example: 'NP' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,3}$/, { message: 'code must be 2-3 letters or digits' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  code?: string;
}

/** FLT-08 */
export class BaggagePolicyDto {
  @ApiProperty({ example: 40, description: 'Price per extra bag (> 0), platform currency' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'extraBagPrice must be greater than 0' })
  @Max(LIMITS.MAX_PRICE)
  extraBagPrice: number;

  @ApiProperty({ example: 2, description: 'Maximum extra bags per passenger (>= 0)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(LIMITS.MAX_BAGS)
  maxExtraBags: number;
}

export class CancellationTierDto {
  @ApiProperty({ example: 7, description: 'Days before departure/check-in threshold (integer >= 0)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  daysBefore: number;

  @ApiProperty({ example: 50, description: 'Refund percentage 0-100' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  refundPercent: number;
}

/** FLT-09 / HTL-10 */
export class CancellationPolicyDto {
  @ApiProperty({ type: [CancellationTierDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CancellationTierDto)
  tiers: CancellationTierDto[];
}

export function assertUniqueThresholds(tiers: { daysBefore: number }[]) {
  const seen = new Set<number>();
  for (const t of tiers) {
    if (seen.has(t.daysBefore)) return false;
    seen.add(t.daysBefore);
  }
  return true;
}
export { ArrayUnique };
