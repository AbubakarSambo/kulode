import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';

export class ExtendTrialDto {
  @ApiProperty({ example: 14, description: 'Number of days to extend the trial by (can be negative to shorten it)' })
  @IsInt()
  @Min(-365)
  @Max(365)
  days: number;
}
