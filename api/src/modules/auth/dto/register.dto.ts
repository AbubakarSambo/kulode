import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PosMode } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'CleanTex' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  organizationName: string;

  @ApiProperty({ example: 'amina@cleantex.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Amina' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Abdullahi' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[A-Z])(?=.*[\d\W]).{8,}$/, {
    message: 'Password must be at least 8 characters and contain at least 1 uppercase letter and 1 number or special character',
  })
  password: string;

  @ApiPropertyOptional({
    enum: PosMode,
    description: 'Which checkout flow to set up the new org for. Defaults to RESTAURANT when omitted — set via a `?type=` query param on the landing page/register link that referred this signup.',
  })
  @IsOptional()
  @IsEnum(PosMode)
  posMode?: PosMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  _hp?: string;
}
