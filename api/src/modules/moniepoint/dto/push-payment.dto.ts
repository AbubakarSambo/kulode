import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive } from 'class-validator';

export class PushPaymentDto {
  @ApiPropertyOptional({ description: 'Amount to push, in Naira. Defaults to the order total if omitted.' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;
}
