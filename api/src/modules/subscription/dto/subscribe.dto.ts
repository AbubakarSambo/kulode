import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubscribeDto {
  @ApiProperty({ enum: ['PRO', 'BUSINESS'] })
  @IsEnum(['PRO', 'BUSINESS'])
  @IsNotEmpty()
  planTier: 'PRO' | 'BUSINESS';

  @ApiProperty({ enum: ['MONTHLY', 'ANNUAL'] })
  @IsEnum(['MONTHLY', 'ANNUAL'])
  @IsNotEmpty()
  billingPeriod: 'MONTHLY' | 'ANNUAL';
}
