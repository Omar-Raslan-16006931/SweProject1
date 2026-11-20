import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsMongoId, IsOptional, Matches, Max, Min, ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class RoomGuestsDto {
  @ApiProperty({ description: 'Room id (from GET /api/hotels/:id/rooms/available)' })
  @IsMongoId()
  roomId: string;

  @ApiProperty({ example: 2, description: 'Adults assigned to this room' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  adults: number;

  @ApiPropertyOptional({ example: [7], description: 'Ages of children assigned to this room (0-17)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(17, { each: true })
  childrenAges?: number[];
}

/** HTL-16 / HTL-18 */
export class HotelBookingRequestDto {
  @ApiProperty() @IsMongoId() hotelId: string;

  @ApiProperty({ example: '2026-12-20' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'checkIn must be YYYY-MM-DD' })
  checkIn: string;

  @ApiProperty({ example: '2026-12-23' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'checkOut must be YYYY-MM-DD' })
  checkOut: string;

  @ApiProperty({ type: [RoomGuestsDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RoomGuestsDto)
  rooms: RoomGuestsDto[];
}

export class HotelReservationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['Pending Payment', 'Confirmed', 'Completed', 'Expired', 'Cancelled'] })
  @IsOptional()
  @IsIn(['Pending Payment', 'Confirmed', 'Completed', 'Expired', 'Cancelled'])
  status?: string;

  @ApiPropertyOptional({ example: '2026-12-01', description: 'Stays overlapping from this date' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Stays overlapping until this date' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
