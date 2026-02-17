import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto';
import { CurrentUser, Roles, Role } from '../../common';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current organization details' })
  @ApiResponse({ status: 200, description: 'Organization details' })
  async findCurrent(@CurrentUser('organizationId') organizationId: string) {
    return this.organizationsService.findOne(organizationId);
  }

  @Patch('current')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update organization settings' })
  @ApiResponse({ status: 200, description: 'Organization updated' })
  async update(
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.organizationsService.update(organizationId, dto);
  }

  @Get('onboarding-status')
  @ApiOperation({ summary: 'Get onboarding checklist status' })
  @ApiResponse({ status: 200, description: 'Onboarding status' })
  async getOnboardingStatus(@CurrentUser('organizationId') organizationId: string) {
    return this.organizationsService.getOnboardingStatus(organizationId);
  }

  @Patch('onboarding-dismiss')
  @ApiOperation({ summary: 'Dismiss onboarding checklist' })
  @ApiResponse({ status: 200, description: 'Onboarding dismissed' })
  async dismissOnboarding(@CurrentUser('organizationId') organizationId: string) {
    return this.organizationsService.dismissOnboarding(organizationId);
  }

  @Get('paystack-status')
  @ApiOperation({ summary: 'Get Paystack setup status' })
  @ApiResponse({ status: 200, description: 'Paystack status' })
  async getPaystackStatus(@CurrentUser('organizationId') organizationId: string) {
    return this.organizationsService.getPaystackStatus(organizationId);
  }
}
