import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class QuickAddCustomerDto {
  @ApiProperty({ example: 'Tunde Bakare' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: '08031234569' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ description: 'The staff member who collected the number (they get the credit)' })
  @IsUUID()
  collectedById: string;

  @ApiPropertyOptional({ description: 'When the number was collected, if not now (offline sync)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  capturedAt?: Date;

  @ApiPropertyOptional({ description: 'Idempotency key so a retried request is a no-op' })
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;
}
