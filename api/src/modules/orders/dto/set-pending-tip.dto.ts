import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class SetPendingTipDto {
  @ApiProperty({
    description:
      'The tip the guest says they will add when they pay on the Moniepoint terminal or by transfer, in Naira. 0 clears it.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  amount: number;

  @ApiPropertyOptional({ description: 'Set once an unusually large tip (over ₦20,000 or half the bill) has been confirmed' })
  @IsOptional()
  @IsBoolean()
  tipConfirmed?: boolean;
}
