import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** ACC-01 password rule: >= 8 characters with at least one letter and one digit. */
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
export const PASSWORD_MESSAGE = 'Password must have at least 8 characters, including at least one letter and one digit';

export class RegisterDto {
  @ApiProperty({ example: 'Sara Ali' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({ example: 'sara@example.com' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @ApiProperty({ example: 'Passw0rd!', description: PASSWORD_MESSAGE })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;

  @ApiProperty({ example: true, description: 'Mandatory terms-and-privacy consent (ACC-01)' })
  @IsBoolean()
  @Equals(true, { message: 'You must accept the terms and privacy policy' })
  acceptTerms: boolean;
}

export class LoginDto {
  @ApiProperty({ example: 'sara@example.com' })
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @ApiProperty({ example: 'Passw0rd!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ description: PASSWORD_MESSAGE })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

export class TemporaryPasswordDto {
  @ApiProperty({ description: `Temporary password set by the admin. ${PASSWORD_MESSAGE}` })
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  temporaryPassword: string;
}
