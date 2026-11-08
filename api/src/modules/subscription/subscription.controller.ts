import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { SubscribeDto } from './dto';
import { CurrentUser, Roles, Role } from '../../common';

@ApiTags('Subscription')
@ApiBearerAuth()
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current plan and usage' })
  @ApiResponse({ status: 200, description: 'Current plan details' })
  async getCurrentPlan(@CurrentUser('organizationId') organizationId: string) {
    return this.subscriptionService.getCurrentPlan(organizationId);
  }

  @Post('subscribe')
  // Supervisors and managers are often the ones on site when a trial ends, so they can start a
  // payment. Cancelling and the auto-renew toggle stay admin-only.
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Subscribe to a plan' })
  @ApiResponse({ status: 201, description: 'Paystack payment URL' })
  async subscribe(
    @Body() dto: SubscribeDto,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('email') email: string,
  ) {
    return this.subscriptionService.subscribe(
      organizationId,
      dto.planTier,
      dto.billingPeriod,
      email,
    );
  }

  @Get('direct-debit/banks')
  @ApiOperation({ summary: 'Banks that can be linked for bank-account renewals' })
  async getDirectDebitBanks() {
    return this.subscriptionService.getDirectDebitBanks();
  }

  // Linking a bank account lets us debit it on every renewal, so unlike starting an upgrade it
  // stays with the account admins.
  @Post('direct-debit/setup')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Start linking a bank account for renewals (no payment is taken)' })
  @ApiResponse({ status: 201, description: 'Paystack page where the bank account is linked' })
  async setupDirectDebit(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('email') email: string,
  ) {
    return this.subscriptionService.setupDirectDebit(organizationId, email);
  }

  @Delete('direct-debit')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Remove the linked bank account; renewals go back to the card' })
  async removeDirectDebit(@CurrentUser('organizationId') organizationId: string) {
    return this.subscriptionService.removeDirectDebit(organizationId);
  }

  @Patch('auto-renew')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Toggle subscription auto-renewal' })
  @ApiResponse({ status: 200, description: 'Auto-renew status updated' })
  async toggleAutoRenew(
    @Body('enabled') enabled: boolean,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.subscriptionService.toggleAutoRenew(organizationId, enabled);
  }

  @Post('cancel')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Cancel subscription' })
  @ApiResponse({ status: 200, description: 'Subscription cancelled' })
  async cancel(@CurrentUser('organizationId') organizationId: string) {
    return this.subscriptionService.cancelSubscription(organizationId);
  }

  @Post('verify-payment')
  @ApiOperation({ summary: 'Verify and activate a subscription payment' })
  @ApiResponse({ status: 200, description: 'Subscription activated' })
  async verifyPayment(
    @Body('reference') reference: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.subscriptionService.verifyAndActivatePayment(organizationId, reference);
  }

  @Get('payment-history')
  @ApiOperation({ summary: 'Get subscription payment history' })
  @ApiResponse({ status: 200, description: 'Payment records' })
  async getPaymentHistory(@CurrentUser('organizationId') organizationId: string) {
    return this.subscriptionService.getPaymentHistory(organizationId);
  }
}
