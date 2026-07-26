import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class OpenShiftDto {
  @ApiPropertyOptional({ example: 10000, description: 'Starting cash float in the till' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  openingFloat?: number;
}
