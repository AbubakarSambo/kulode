import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum ReportPeriod {
  TODAY = 'TODAY',
  THIS_MONTH = 'THIS_MONTH',
  LAST_MONTH = 'LAST_MONTH',
  LAST_WEEK = 'LAST_WEEK',
  THIS_QUARTER = 'THIS_QUARTER',
  LAST_QUARTER = 'LAST_QUARTER',
  THIS_YEAR = 'THIS_YEAR',
  LAST_YEAR = 'LAST_YEAR',
  CUSTOM = 'CUSTOM',
}

export class ReportFilterDto {
  @ApiPropertyOptional({ enum: ReportPeriod, default: ReportPeriod.THIS_MONTH })
  @IsOptional()
  @IsEnum(ReportPeriod)
  period?: ReportPeriod = ReportPeriod.THIS_MONTH;

  @ApiPropertyOptional({ description: 'Start date (required if period is CUSTOM)' })
  @IsOptional()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional({ description: 'End date (required if period is CUSTOM)' })
  @IsOptional()
  @Type(() => Date)
  endDate?: Date;
}
