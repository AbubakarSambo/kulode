import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'PAYSTACK', 'OTHER'] as const;

export class CloseOrderDto {
  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  paymentMethod: (typeof PAYMENT_METHODS)[number];

  @ApiPropertyOptional({ description: 'Defaults to the order total' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({ description: 'Required to initialize a PAYSTACK checkout link' })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Client-generated UUID for idempotent retries (e.g. from the offline queue). Required for non-PAYSTACK close — the PAYSTACK checkout flow has its own reference-based idempotency.',
  })
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;
}
