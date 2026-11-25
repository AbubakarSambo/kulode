import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Can, CurrentUser, CurrentUserData } from '../../common';
import { TipsService } from './tips.service';
import { RecordTipPayoutDto, TipLedgerQueryDto, TipOwedQueryDto, UpdateTipSettingsDto } from './dto';

@ApiTags('Tips')
@ApiBearerAuth()
@Controller('tips')
export class TipsController {
  constructor(private readonly tipsService: TipsService) {}

  // Read by the till at checkout, so any signed-in role may read it; only an admin changes it.
  @Get('settings')
  @ApiOperation({ summary: 'Whether tipping is on and the quick-pick amounts' })
  getSettings(@CurrentUser('organizationId') organizationId: string) {
    return this.tipsService.getSettings(organizationId);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Turn tipping on/off and edit the preset amounts (admin)' })
  @Can('TIPS_CONFIGURE')
  updateSettings(@CurrentUser('organizationId') organizationId: string, @Body() dto: UpdateTipSettingsDto) {
    return this.tipsService.updateSettings(organizationId, dto);
  }

  @Get('owed')
  @ApiOperation({ summary: 'Tips earned, paid out and balance owed per waiter' })
  @Can('TIPS_MANAGE')
  owed(@CurrentUser('organizationId') organizationId: string, @Query() query: TipOwedQueryDto) {
    return this.tipsService.owedReport(organizationId, query);
  }

  @Get('ledger')
  @ApiOperation({ summary: "A waiter's running tip ledger (omit waiterId for the unassigned pool)" })
  @Can('TIPS_MANAGE')
  ledger(@CurrentUser('organizationId') organizationId: string, @Query() query: TipLedgerQueryDto) {
    return this.tipsService.ledger(organizationId, query.waiterId);
  }

  @Post('payouts')
  @ApiOperation({ summary: 'Mark tips paid out to a waiter' })
  @Can('TIPS_MANAGE')
  payout(@CurrentUser() user: CurrentUserData, @Body() dto: RecordTipPayoutDto) {
    return this.tipsService.recordPayout(user.organizationId, { id: user.id, roles: user.roles }, dto);
  }
}
