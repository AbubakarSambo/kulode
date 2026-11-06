import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  LEADERBOARD_METRICS,
  LEADERBOARD_ROLES,
  type LeaderboardMetric,
  type LeaderboardRole,
} from '../leaderboard.settings';

export class UpdateLeaderboardSettingsDto {
  @ApiPropertyOptional({ enum: LEADERBOARD_METRICS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(LEADERBOARD_METRICS as unknown as string[], { each: true })
  metrics?: LeaderboardMetric[];

  @ApiPropertyOptional({ enum: LEADERBOARD_ROLES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(LEADERBOARD_ROLES as unknown as string[], { each: true })
  roles?: LeaderboardRole[];

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  topN?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  minOrders?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showAmountsToAll?: boolean;
}
