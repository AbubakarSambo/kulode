import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
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

  @ApiPropertyOptional({
    enum: Role,
    isArray: true,
    description: 'One or more roles (e.g. Cashier + Waiter) — access is the union of what each grants. Defaults to a single role based on the org type when omitted.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(Role, { each: true })
  roles?: Role[];

  @ApiPropertyOptional({ example: '+234 123 456 7890' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
