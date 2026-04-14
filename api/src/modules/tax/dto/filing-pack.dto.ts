import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsDateString, IsOptional, IsNumberString } from 'class-validator';

export class FilingPackQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsNotEmpty()
  @IsDateString()
  endDate: string;
}

export class DeductibleSummaryQueryDto {
  @ApiPropertyOptional({ example: '2026' })
  @IsOptional()
  @IsNumberString()
  year?: string;
}
