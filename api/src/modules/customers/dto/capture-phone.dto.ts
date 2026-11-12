import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CapturePhoneDto {
  @ApiProperty({ example: '08031234569' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  phone: string;

  @ApiPropertyOptional({ description: 'Name for a new customer; the number is used when blank' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Attach the number to this existing customer' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiProperty({ enum: ['ORDER', 'PAY'], description: 'Which screen it was captured on' })
  @IsIn(['ORDER', 'PAY'])
  source: 'ORDER' | 'PAY';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({ description: 'When it was captured, if not now (offline sync)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  capturedAt?: Date;

  @ApiPropertyOptional({ description: 'Idempotency key so a retried request is a no-op' })
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;
}

export class LookupPhoneQueryDto {
  @ApiProperty({ example: '08031234569' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  phone: string;
}
