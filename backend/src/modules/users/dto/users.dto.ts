import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** ACC-09 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Sara Ali' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @ApiPropertyOptional({ example: '+201001234567', description: 'International format, 7-15 digits with optional leading +' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'phone must contain 7-15 digits with an optional leading +' })
  phone?: string;

  @ApiPropertyOptional({ example: 'EUR', description: 'One of the supported currencies (GET /api/currencies)' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  preferredCurrency?: string;
}

export class DeactivateAccountDto {
  @ApiPropertyOptional({ description: 'Must be true: explicit confirmation (ACC-12, GEN-03)' })
  @IsOptional()
  confirm?: boolean;
}
