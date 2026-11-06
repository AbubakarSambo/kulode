import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { LEADERBOARD_METRICS, type LeaderboardMetric } from '../leaderboard.settings';

export class LeaderboardQueryDto {
  @ApiProperty({ description: 'Start date (YYYY-MM-DD), inclusive' })
  @IsDateString()
  from: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD), inclusive. Defaults to `from`.' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: LEADERBOARD_METRICS, description: "Defaults to the org's first enabled metric." })
  @IsOptional()
  @IsIn(LEADERBOARD_METRICS as unknown as string[])
  metric?: LeaderboardMetric;
}
