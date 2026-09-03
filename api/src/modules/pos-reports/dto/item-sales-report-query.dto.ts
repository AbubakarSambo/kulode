import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

  @ApiPropertyOptional({
    example: '06:00',
    description:
      'Start time of day ("HH:mm", 24-hour), inclusive. Defaults to the org\'s shift start time when omitted.',
  })
  @IsOptional()
  @IsString()
  @Matches(TIME_OF_DAY_PATTERN, { message: 'fromTime must be in HH:mm format' })
  fromTime?: string;

  @ApiPropertyOptional({
    example: '14:00',
    description: 'End time of day ("HH:mm", 24-hour), inclusive. Defaults to the org\'s shift end time when omitted.',
  })
  @IsOptional()
  @IsString()
  @Matches(TIME_OF_DAY_PATTERN, { message: 'toTime must be in HH:mm format' })
  toTime?: string;
}
