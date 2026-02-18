import {
  Controller,
  Get,
  Post,
  Body,
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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
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
