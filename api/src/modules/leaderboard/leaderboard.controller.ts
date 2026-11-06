import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Can, CurrentUser, CurrentUserData } from '../../common';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardQueryDto, UpdateLeaderboardSettingsDto } from './dto';

@ApiTags('POS Leaderboard')
@ApiBearerAuth()
@Controller('pos-leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  @ApiOperation({ summary: 'Staff leaderboard for a period: ranks by revenue or average check; amounts are limited to the viewer\'s own unless allowed' })
  @Can('LEADERBOARD_VIEW')
  get(@CurrentUser() user: CurrentUserData, @Query() query: LeaderboardQueryDto) {
    return this.leaderboardService.getLeaderboard(user, query);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Leaderboard settings (admin)' })
  @Can('LEADERBOARD_CONFIGURE')
  getSettings(@CurrentUser('organizationId') organizationId: string) {
    return this.leaderboardService.getSettings(organizationId);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update leaderboard settings (admin)' })
  @Can('LEADERBOARD_CONFIGURE')
  updateSettings(@CurrentUser('organizationId') organizationId: string, @Body() dto: UpdateLeaderboardSettingsDto) {
    return this.leaderboardService.updateSettings(organizationId, dto);
  }
}
