import { Controller, Get, Patch, Post, Param, Query, Body, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PlatformService } from './platform.service';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { UpdatePlatformOrgDto } from './dto/update-platform-org.dto';
import { GrantOrgAccessDto } from './dto/grant-org-access.dto';
import { UpdateMembershipRolesDto } from './dto/update-membership-roles.dto';
import { ExtendTrialDto } from './dto/extend-trial.dto';
import { GoLiveDto } from './dto/go-live.dto';
import { OrgGoLiveService } from './org-go-live.service';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { PlanTier, SubscriptionStatus } from '@prisma/client';

@ApiTags('Platform')
@ApiBearerAuth()
@Controller('platform')
@UseGuards(PlatformAdminGuard)
export class PlatformController {
  constructor(
    private readonly platformService: PlatformService,
    private readonly orgGoLiveService: OrgGoLiveService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get platform admin dashboard data' })
  @ApiResponse({ status: 200, description: 'Platform dashboard data' })
  @ApiResponse({ status: 403, description: 'Not a platform admin' })
  async getDashboard(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.platformService.getDashboard(startDate, endDate);
  }

  @Get('pos-dashboard')
  @ApiOperation({ summary: 'Get platform admin dashboard data for POS-enabled organizations' })
  @ApiResponse({ status: 200, description: 'Platform POS dashboard data' })
  @ApiResponse({ status: 403, description: 'Not a platform admin' })
  async getPosDashboard(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.platformService.getPosDashboard(startDate, endDate);
  }

  @Get('organizations')
  @ApiOperation({ summary: 'Get paginated organizations with search and filters' })
  @ApiResponse({ status: 200, description: 'Paginated organizations list' })
  async getOrganizations(
    @Query('search') search?: string,
    @Query('planTier') planTier?: PlanTier,
    @Query('subscriptionStatus') subscriptionStatus?: SubscriptionStatus,
    @Query('isGrandfathered') isGrandfathered?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.platformService.getOrganizations({
      search,
      planTier,
      subscriptionStatus,
      isGrandfathered,
      page,
      limit,
    });
  }

  @Get('organizations/:id')
  @ApiOperation({ summary: 'Get organization details' })
  @ApiResponse({ status: 200, description: 'Organization details' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async getOrganizationDetails(@Param('id') id: string) {
    const details = await this.platformService.getOrganizationDetails(id);
    if (!details) {
      throw new NotFoundException('Organization not found');
    }
    return details;
  }

  @Patch('organizations/:id')
  @ApiOperation({ summary: 'Update organization subscription and billing config' })
  @ApiResponse({ status: 200, description: 'Organization updated' })
  async updateOrganization(
    @Param('id') id: string,
    @Body() dto: UpdatePlatformOrgDto,
  ) {
    return this.platformService.updateOrganization(id, dto);
  }

  @Patch('organizations/:id/trial')
  @ApiOperation({ summary: 'Extend (or shorten) an organization\'s Pro trial by a custom number of days' })
  @ApiResponse({ status: 200, description: 'Trial end date updated' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async extendTrial(
    @Param('id') id: string,
    @Body() dto: ExtendTrialDto,
  ) {
    return this.platformService.extendTrial(id, dto.days);
  }

  @Get('organizations/:id/go-live/preview')
  @ApiOperation({ summary: 'Count the pre-launch test activity that Go live would delete' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async previewGoLive(@Param('id') id: string) {
    return this.orgGoLiveService.preview(id);
  }

  @Post('organizations/:id/go-live')
  @ApiOperation({ summary: "Delete an org's pre-launch test activity, keeping its setup. Runs once per org." })
  @ApiResponse({ status: 400, description: 'Confirmation name does not match' })
  @ApiResponse({ status: 409, description: 'Organization already went live' })
  async goLive(
    @Param('id') id: string,
    @Body() dto: GoLiveDto,
    @CurrentUser() admin: CurrentUserData,
  ) {
    return this.orgGoLiveService.goLive(id, dto, { id: admin.id, email: admin.email });
  }

  @Get('vendor-payouts/pending')
  @ApiOperation({ summary: 'List vendor subaccounts across all organizations awaiting manual Paystack review' })
  @ApiResponse({ status: 200, description: 'Pending/failed vendor subaccounts' })
  async getPendingVendorPayouts() {
    return this.platformService.getPendingVendorPayouts();
  }

  @Patch('vendor-payouts/:vendorId/activate')
  @ApiOperation({ summary: 'Mark a vendor subaccount ACTIVE after manually verifying it in the Paystack Dashboard' })
  @ApiResponse({ status: 200, description: 'Vendor payout status updated' })
  async activateVendorPayout(@Param('vendorId') vendorId: string) {
    return this.platformService.activateVendorPayout(vendorId);
  }

  @Get('users/by-email')
  @ApiOperation({ summary: 'Look up a user by exact email across all organizations' })
  @ApiResponse({ status: 200, description: 'User and their current organization memberships' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findUserByEmail(@Query('email') email: string) {
    return this.platformService.findUserByEmail(email);
  }

  @Post('users/:userId/organizations')
  @ApiOperation({ summary: 'Grant a user access to another organization (creates/updates their membership)' })
  @ApiResponse({ status: 200, description: 'Membership created or updated' })
  @ApiResponse({ status: 404, description: 'User or organization not found' })
  async grantOrganizationAccess(
    @Param('userId') userId: string,
    @Body() dto: GrantOrgAccessDto,
  ) {
    return this.platformService.grantOrganizationAccess(userId, dto.organizationId, dto.roles);
  }

  @Patch('users/:userId/organizations/:organizationId')
  @ApiOperation({ summary: "Replace the roles a user holds in one of their organizations (primary org included)" })
  @ApiResponse({ status: 200, description: 'Roles updated' })
  @ApiResponse({ status: 404, description: 'User, organization, or membership not found' })
  async updateMembershipRoles(
    @Param('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateMembershipRolesDto,
  ) {
    return this.platformService.updateMembershipRoles(userId, organizationId, dto.roles);
  }
}

