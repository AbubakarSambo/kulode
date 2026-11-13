import { Body, Controller, Get, Post, Put } from '@nestjs/common';
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

  @Post('enrol')
  @ApiOperation({ summary: 'Enrol a customer as a loyalty member (upgrades an existing customer, never duplicates)' })
  @Can('LOYALTY_ENROL')
  enrol(@CurrentUser() user: CurrentUserData, @Body() dto: EnrolMemberDto) {
    return this.loyalty.enrol({ organizationId: user.organizationId, actorId: user.id }, dto);
  }
}
