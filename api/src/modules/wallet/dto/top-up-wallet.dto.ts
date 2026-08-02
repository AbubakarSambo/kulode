import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

const TOPUP_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'] as const;

export class TopUpWalletDto {
  @ApiProperty({ minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ enum: TOPUP_PAYMENT_METHODS })
  @IsIn(TOPUP_PAYMENT_METHODS)
  paymentMethod: (typeof TOPUP_PAYMENT_METHODS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Client-generated UUID for idempotent retries' })
  @IsUUID()
  clientRequestId: string;
}
