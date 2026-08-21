import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class ItemSalesReportQueryDto {
  @ApiProperty({ description: 'Start date (YYYY-MM-DD), inclusive' })
  @IsDateString()
  from: string;

  @ApiPropertyOptional({
    description: 'End date (YYYY-MM-DD), inclusive. Defaults to `from` for a single-day report.',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
