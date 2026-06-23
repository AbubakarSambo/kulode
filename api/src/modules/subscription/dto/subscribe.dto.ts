import { IsEnum, IsNotEmpty } from 'class-validator';
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
}
