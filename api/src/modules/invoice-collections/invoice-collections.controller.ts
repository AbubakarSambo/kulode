import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Role, Roles } from '../../common';
import { UpdateCollectionPolicyDto } from './dto';
import { InvoiceCollectionsService } from './invoice-collections.service';

// Reminders are routine invoicing work, so the same roles that run invoices can approve them.
// Changing the policy (schedule, auto-send, pause) is a business decision: admins only.
export const REMINDER_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT, Role.STAFF];
export const POLICY_EDIT_ROLES = [Role.SUPER_ADMIN, Role.ADMIN];

@ApiTags('Invoice collections')
@ApiBearerAuth()
@Controller('invoice-collections')
export class InvoiceCollectionsController {
  constructor(private readonly collections: InvoiceCollectionsService) {}

  @Get('policy')
  @Roles(...REMINDER_ROLES)
  @ApiOperation({ summary: 'The business reminder policy, or the defaults if automatic reminders are not switched on' })
  async getPolicy(@CurrentUser('organizationId') organizationId: string) {
    return this.collections.getPolicy(organizationId);
  }

  @Put('policy')
  @Roles(...POLICY_EDIT_ROLES)
  @ApiOperation({ summary: 'Switch on automatic reminders, or change the schedule, mode, send hour, cap or pause' })
  @ApiResponse({ status: 200, description: 'The saved policy' })
  async updatePolicy(
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: UpdateCollectionPolicyDto,
  ) {
    return this.collections.upsertPolicy(organizationId, dto);
  }

  @Get('reminders/pending')
  @Roles(...REMINDER_ROLES)
  @ApiOperation({ summary: 'Reminders waiting for the owner to approve or skip' })
  async listPending(@CurrentUser('organizationId') organizationId: string) {
    return this.collections.listPendingReminders(organizationId);
  }

  @Post('reminders/:id/approve')
  @HttpCode(200)
  @Roles(...REMINDER_ROLES)
  @ApiOperation({ summary: 'Approve a reminder and send it now' })
  @ApiResponse({ status: 200, description: '{ sent, reason? } — reason explains a reminder that was not sent' })
  @ApiResponse({ status: 404, description: 'Reminder not found' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.collections.approveReminder(organizationId, id);
  }

  @Post('reminders/:id/skip')
  @HttpCode(200)
  @Roles(...REMINDER_ROLES)
  @ApiOperation({ summary: 'Skip a pending reminder without sending it' })
  @ApiResponse({ status: 404, description: 'No pending reminder with that id' })
  async skip(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.collections.skipReminder(organizationId, id);
  }
}
