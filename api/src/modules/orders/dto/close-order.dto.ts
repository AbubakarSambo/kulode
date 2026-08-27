import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CloseOrderDto {
  @ApiProperty({ description: 'Name of an active PaymentType for this org, or the reserved "PAYSTACK"/"WALLET"' })
  @IsString()
  @IsNotEmpty()
  paymentMethod: string;

  @ApiPropertyOptional({
    description:
      'Amount for this tender. Defaults to the full remaining balance. Pass less than that to record a partial ' +
      "payment (even-split / custom-amount bill splitting) — the order stays open for payment until it's fully covered.",
  })
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
