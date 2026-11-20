import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsMongoId, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ReportTargetType } from '../../common/enums';

export class CreateReportDto {
  @ApiProperty({ enum: ReportTargetType }) @IsEnum(ReportTargetType) targetType: ReportTargetType;
  @ApiProperty() @IsMongoId() targetId: string;
  @ApiProperty({ example: 'Spam / offensive content', maxLength: 500 })
  @IsString() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsNotEmpty() @MaxLength(500)
  reason: string;
}
