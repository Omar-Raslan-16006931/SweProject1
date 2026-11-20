import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** ACC-01 password rule: >= 8 characters with at least one letter and one digit. */
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
export const PASSWORD_MESSAGE = 'Password must have at least 8 characters, including at least one letter and one digit';
/** bcrypt only uses the first 72 bytes, so longer passwords are refused instead of being silently truncated. */
export const PASSWORD_MAX = 72;
export const PASSWORD_MAX_MESSAGE = `Password must be at most ${PASSWORD_MAX} characters`;

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
  @MaxLength(PASSWORD_MAX, { message: PASSWORD_MAX_MESSAGE })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;

  @ApiProperty({ example: true, description: 'Mandatory terms-and-privacy consent (ACC-01)' })
  @IsBoolean()
  @Equals(true, { message: 'You must accept the terms and privacy policy' })
  acceptTerms: boolean;
}

export class LoginDto {
  // ACC-04: a malformed e-mail is answered with the same generic "Invalid email or password" as any other failure.
  @ApiProperty({ example: 'sara@example.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @ApiProperty({ example: 'Passw0rd!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ description: PASSWORD_MESSAGE })
  @IsString()
  @MaxLength(PASSWORD_MAX, { message: PASSWORD_MAX_MESSAGE })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

export class TemporaryPasswordDto {
  @ApiProperty({ description: `Temporary password set by the admin. ${PASSWORD_MESSAGE}` })
  @IsString()
  @MinLength(8)
  @MaxLength(PASSWORD_MAX, { message: PASSWORD_MAX_MESSAGE })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  temporaryPassword: string;
}
