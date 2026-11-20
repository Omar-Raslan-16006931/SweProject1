import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @Type(() => Number) @IsInt() @Min(1) @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 'Great stay, friendly staff.', maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  text?: string;
}

export class UpdateReviewDto {
  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: 5 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  rating?: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  text?: string;
}
