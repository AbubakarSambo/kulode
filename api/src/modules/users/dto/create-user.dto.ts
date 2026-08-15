import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsEnum,
  MaxLength,
  IsOptional,
} from 'class-validator';
import { Role } from '../../../common';

export class CreateUserDto {
  @ApiPropertyOptional({
    example: 'user@cleantex.com',
    description: 'Required unless role is PIN-eligible (WAITER/PASS/RUNNER/CASHIER) — those get an auto-generated internal placeholder if omitted',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'John' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({ enum: Role, default: Role.STAFF })
  @IsOptional()
  @IsEnum(Role)
  role?: Role = Role.STAFF;
}
