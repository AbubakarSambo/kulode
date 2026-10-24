import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

const TOPUP_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'] as const;

// How each method reads in the wallet history / printed statements ("Top-up via Bank Transfer").
export const TOPUP_PAYMENT_METHOD_LABELS: Record<(typeof TOPUP_PAYMENT_METHODS)[number], string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  CARD: 'Card',
  OTHER: 'Other',
};

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
