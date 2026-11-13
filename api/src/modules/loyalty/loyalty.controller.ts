import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Can, CurrentUser, CurrentUserData, hasPermission } from '../../common';
import { EnrolMemberDto, UpdateLoyaltySettingsDto } from './dto';
import { LoyaltyService } from './loyalty.service';

@ApiTags('Loyalty')
@ApiBearerAuth()
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Loyalty programme settings and reward rules (food cost is admin-only)' })
  @Can('LOYALTY_ENROL')
  settings(@CurrentUser() user: CurrentUserData) {
    return this.loyalty.getSettings(user.organizationId, hasPermission(user.roles, 'LOYALTY_CONFIGURE'));
  }

  @Put('settings')
  @ApiOperation({ summary: 'Switch the programme on/off and edit its reward rules (admin)' })
  @Can('LOYALTY_CONFIGURE')
  updateSettings(@CurrentUser() user: CurrentUserData, @Body() dto: UpdateLoyaltySettingsDto) {
    return this.loyalty.updateSettings(user.organizationId, dto);
  }

  @Get('members/:customerId')
  @ApiOperation({ summary: 'A member\'s lifetime spend, rewards they can use now, and progress to the next reward' })
  @Can('LOYALTY_ENROL')
  member(@CurrentUser('organizationId') organizationId: string, @Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.loyalty.getMemberSummary(organizationId, customerId);
  }

  @Post('enrol')
  @ApiOperation({ summary: 'Enrol a customer as a loyalty member (upgrades an existing customer, never duplicates)' })
  @Can('LOYALTY_ENROL')
  enrol(@CurrentUser() user: CurrentUserData, @Body() dto: EnrolMemberDto) {
    return this.loyalty.enrol({ organizationId: user.organizationId, actorId: user.id }, dto);
  }
}
