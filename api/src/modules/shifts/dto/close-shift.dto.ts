import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CloseShiftDto {
  @ApiProperty({ example: 62500, description: 'Physically counted cash in the till at close' })
  @IsNumber()
  @Min(0)
  countedCash: number;

  @ApiPropertyOptional({
    example: { 'Card (Moniepoint)': 2769150.35, 'Transfer (Moniepoint)': 4167041.44 },
    description:
      'Counted amount per non-cash payment method, keyed by payment method name. Methods omitted here default to their expected (settled) amount, giving zero variance.',
  })
  @IsOptional()
  @IsObject()
  countedAmounts?: Record<string, number>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
