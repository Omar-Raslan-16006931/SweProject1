import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/** GEN-05: every list is paginated with a page size of 10. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1, description: 'Page number (page size is fixed to 10, GEN-05)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;
}
