import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEmail, IsOptional, MaxLength } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Tunde Bakare' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: '+234 123 456 7890' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: 'tunde@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Prefers window seating' })
  @IsOptional()
  @IsString()
  notes?: string;
}

