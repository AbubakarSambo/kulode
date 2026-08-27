import { Controller, Get, Patch, Param, Query, Body, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PlatformService } from './platform.service';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { UpdatePlatformOrgDto } from './dto/update-platform-org.dto';
import { PlanTier, SubscriptionStatus } from '@prisma/client';

@ApiTags('Platform')
@ApiBearerAuth()
@Controller('platform')
@UseGuards(PlatformAdminGuard)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

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
}

