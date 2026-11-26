import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
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

/** Pay for a plan from a bank account and create the renewal mandate in the same request. */
export class DirectDebitChargeDto {
  @ApiProperty({ enum: ['PRO'] })
  @IsEnum(['PRO'])
  planTier: 'PRO';

  @ApiProperty({ enum: ['MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL'] })
  @IsEnum(['MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL'])
  billingPeriod: 'MONTHLY' | 'QUARTERLY' | 'BIANNUAL' | 'ANNUAL';

  @ApiProperty({ example: '0123456789' })
  @Matches(/^\d{10}$/, { message: 'Enter your 10-digit account number' })
  accountNumber: string;

  @ApiProperty({ example: '057' })
  @IsString()
  @IsNotEmpty({ message: 'Choose your bank' })
  @MaxLength(20)
  bankCode: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Enter your street address' })
  @MaxLength(200)
  street: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Enter your city' })
  @MaxLength(100)
  city: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Enter your state' })
  @MaxLength(100)
  state: string;

  @ApiProperty({ example: '+2348012345678' })
  @Matches(/^\+\d{10,15}$/, { message: 'Enter your phone number in international format, like +2348012345678' })
  phone: string;
}
