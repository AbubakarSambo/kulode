import { IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubscribeDto {
  // Pro is the only plan on sale; Starter and Business exist only for organizations already on them.
  @ApiProperty({ enum: ['PRO'] })
  @IsEnum(['PRO'])
  @IsNotEmpty()
  planTier: 'PRO';

  @ApiProperty({ enum: ['MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL'] })
  @IsEnum(['MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL'])
  @IsNotEmpty()
  billingPeriod: 'MONTHLY' | 'QUARTERLY' | 'BIANNUAL' | 'ANNUAL';

  @ApiProperty({ enum: ['CARD', 'BANK'], required: false, description: 'How the first payment is made. BANK debits a bank account (monthly plans only).' })
  @IsOptional()
  @IsEnum(['CARD', 'BANK'])
  paymentMethod?: 'CARD' | 'BANK';
}
