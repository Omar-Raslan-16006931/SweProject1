import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PostStatus } from '../../../common/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

const trim = ({ value }: any) => (typeof value === 'string' ? value.trim() : value);
const tags = ({ value }: any) =>
  Array.isArray(value) ? [...new Set(value.map((t) => String(t).trim().toLowerCase()).filter(Boolean))] : value;

export class CreatePostDto {
  @ApiProperty({ example: 'Three days in Cairo' }) @IsString() @IsNotEmpty() @MaxLength(200) @Transform(trim) title: string;
  @ApiProperty({ example: 'Day one we visited...' }) @IsString() @IsNotEmpty() @MaxLength(50000) @Transform(trim) body: string;
  @ApiPropertyOptional({ example: ['egypt', 'history'], description: 'Up to 5 tags, max 30 characters each (BLG-08)' })
  @IsOptional() @IsArray() @ArrayMaxSize(5, { message: 'A post can have at most 5 tags' })
  @IsString({ each: true }) @MaxLength(30, { each: true, message: 'Each tag can have at most 30 characters' }) @Transform(tags)
  tags?: string[];
  @ApiPropertyOptional({ enum: PostStatus, default: PostStatus.DRAFT, description: 'Save as Draft or Publish' })
  @IsOptional() @IsEnum(PostStatus)
  status?: PostStatus;
}

export class UpdatePostDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) @Transform(trim) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(50000) @Transform(trim) body?: string;
  @ApiPropertyOptional({ example: ['egypt'] })
  @IsOptional() @IsArray() @ArrayMaxSize(5, { message: 'A post can have at most 5 tags' })
  @IsString({ each: true }) @MaxLength(30, { each: true, message: 'Each tag can have at most 30 characters' }) @Transform(tags)
  tags?: string[];
  @ApiPropertyOptional({ enum: PostStatus }) @IsOptional() @IsEnum(PostStatus) status?: PostStatus;
}

export class CommentDto {
  @ApiProperty({ example: 'Great tips, thanks!', maxLength: 500 })
  @IsString() @Transform(trim) @IsNotEmpty({ message: 'Comment cannot be empty' }) @MaxLength(500)
  body: string;
}

export class PostListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'egypt', description: 'Filter by tag (BLG-02)' })
  @IsOptional() @IsString() @MaxLength(30)
  tag?: string;

  @ApiPropertyOptional({ example: 'cairo', description: 'Keyword in title, tags or author name; ordered by interaction score (BLG-09)' })
  @IsOptional() @IsString() @MaxLength(100)
  q?: string;
}
