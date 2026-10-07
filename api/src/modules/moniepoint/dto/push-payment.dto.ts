import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';

export class PushPaymentDto {
  @ApiProperty({ description: 'Which of the organization\'s terminals to push this payment to' })
  @IsNotEmpty()
  @IsUUID()
  terminalId: string;

  @ApiPropertyOptional({ description: 'Amount to push, in Naira. Defaults to the order total if omitted.' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;
}
