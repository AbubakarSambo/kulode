import { IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubscribeDto {
  @ApiProperty({ enum: ['STARTER', 'PRO', 'BUSINESS'] })
  @IsEnum(['STARTER', 'PRO', 'BUSINESS'])
  @IsNotEmpty()
  planTier: 'STARTER' | 'PRO' | 'BUSINESS';

  @ApiProperty({ enum: ['MONTHLY', 'ANNUAL'] })
  @IsEnum(['MONTHLY', 'ANNUAL'])
  @IsNotEmpty()
  billingPeriod: 'MONTHLY' | 'ANNUAL';

  @ApiProperty({ enum: ['CARD', 'BANK'], required: false, description: 'How the first payment is made. BANK debits a bank account (monthly plans only).' })
  @IsOptional()
  @IsEnum(['CARD', 'BANK'])
  paymentMethod?: 'CARD' | 'BANK';
}
