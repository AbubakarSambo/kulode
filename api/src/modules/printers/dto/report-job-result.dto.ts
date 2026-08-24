import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ReportJobResultDto {
  @ApiProperty({ enum: ['SENT', 'FAILED'] })
  @IsIn(['SENT', 'FAILED'])
  status: 'SENT' | 'FAILED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  error?: string;
}
