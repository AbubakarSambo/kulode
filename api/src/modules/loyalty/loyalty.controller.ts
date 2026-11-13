import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
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

  @Get('members.csv')
  @ApiOperation({ summary: 'All loyalty members as a CSV (name, phone, email, enrolled date, lifetime spend)' })
  @Can('LOYALTY_REPORT')
  async membersCsv(@CurrentUser('organizationId') organizationId: string, @Res() res: Response) {
    const { filename, csv } = await this.loyalty.membersCsv(organizationId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('members/:customerId')
  @ApiOperation({ summary: 'A member\'s lifetime spend, rewards they can use now, and progress to the next reward' })
  @Can('LOYALTY_ENROL')
  member(@CurrentUser('organizationId') organizationId: string, @Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.loyalty.getMemberSummary(organizationId, customerId);
  }

  @Get('welcome-queue')
  @ApiOperation({ summary: 'Members whose welcome message failed, for staff to follow up' })
  @Can('LOYALTY_REPORT')
  welcomeQueue(@CurrentUser('organizationId') organizationId: string) {
    return this.loyalty.welcomeQueue(organizationId);
  }

  @Post('welcome-queue/:id/resolve')
  @ApiOperation({ summary: 'Mark a failed welcome as followed up by hand' })
  @Can('LOYALTY_REPORT')
  resolveWelcome(@CurrentUser() user: CurrentUserData, @Param('id', ParseUUIDPipe) id: string) {
    return this.loyalty.resolveWelcome(user.organizationId, id, user.id);
  }

  @Post('welcome-queue/:id/retry')
  @ApiOperation({ summary: 'Send a failed welcome message again' })
  @Can('LOYALTY_REPORT')
  retryWelcome(@CurrentUser('organizationId') organizationId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.loyalty.retryWelcome(organizationId, id);
  }

  @Post('enrol')
  @ApiOperation({ summary: 'Enrol a customer as a loyalty member (upgrades an existing customer, never duplicates)' })
  @Can('LOYALTY_ENROL')
  enrol(@CurrentUser() user: CurrentUserData, @Body() dto: EnrolMemberDto) {
    return this.loyalty.enrol({ organizationId: user.organizationId, actorId: user.id }, dto);
  }
}
