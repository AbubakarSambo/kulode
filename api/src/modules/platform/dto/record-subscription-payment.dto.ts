import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RecordSubscriptionPaymentDto {
  @ApiProperty({ enum: ['STARTER', 'PRO', 'BUSINESS'], example: 'PRO' })
  @IsIn(['STARTER', 'PRO', 'BUSINESS'])
  planTier: 'STARTER' | 'PRO' | 'BUSINESS';

  @ApiProperty({ example: 1, description: 'Number of months paid for (1-36)' })
  @IsInt()
  @Min(1)
  @Max(36)
  months: number;

  @ApiPropertyOptional({ example: 50000, description: 'Naira received. Defaults to the plan price for that term (3, 6 or 12 months), otherwise monthly price x months.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ example: 'GTB-TRF-20261115-88', description: 'Your own reference, e.g. the bank transfer reference' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;

  @ApiPropertyOptional({ example: true, description: 'Send the org owner the usual subscription success email (default true)' })
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
