import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  RawBodyRequest,
  Req,
  ParseUUIDPipe,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { PaystackService } from './paystack.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { CreateSubaccountDto, VerifyBankAccountDto } from './dto';
import { CurrentUser, Public, Roles, Role } from '../../common';

@ApiTags('Paystack')
@Controller()
export class PaystackController {
  private readonly logger = new Logger(PaystackController.name);

  constructor(
    private readonly paystackService: PaystackService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Get('paystack/banks')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get list of Nigerian banks' })
  @ApiResponse({ status: 200, description: 'List of banks' })
  async getBanks() {
    return this.paystackService.getBanks();
  }

  @Post('paystack/verify-account')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify bank account details' })
  @ApiResponse({ status: 200, description: 'Account verification result' })
  async verifyAccount(@Body() dto: VerifyBankAccountDto) {
    return this.paystackService.verifyBankAccount(dto);
  }

  @Post('organizations/setup-paystack')
  @ApiBearerAuth()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Set up Paystack subaccount for organization' })
  @ApiResponse({ status: 201, description: 'Subaccount created' })
  async setupPaystack(
    @Body() dto: CreateSubaccountDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.paystackService.createSubaccount(organizationId, dto);
  }

  @Post('invoices/:id/generate-payment-link')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate Paystack payment link for invoice' })
  @ApiResponse({ status: 201, description: 'Payment link generated' })
  async generatePaymentLink(
    @Param('id', ParseUUIDPipe) invoiceId: string,
    @Body('email') email: string,
    @Body('amount') amount: number,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!email) {
      throw new BadRequestException('Email is required');
    }
    return this.paystackService.initializeTransaction(
      organizationId,
      invoiceId,
      email,
      amount,
    );
  }

  @Post('webhooks/paystack')
  @Public()
  @ApiOperation({ summary: 'Paystack webhook endpoint' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async handleWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody?.toString() || JSON.stringify(req.body);

    // Verify signature
    if (!this.paystackService.verifyWebhookSignature(rawBody, signature)) {
      throw new BadRequestException('Invalid signature');
    }

    const { event, data } = req.body;
    const result = await this.paystackService.handleWebhookEvent(event, data);

    // Route subscription webhooks to SubscriptionService
    if (result.type === 'subscription' && result.metadata) {
      const { organization_id, plan_tier, billing_period } = result.metadata;
      if (organization_id && plan_tier && billing_period) {
        await this.subscriptionService.activateSubscription(
          organization_id,
          plan_tier,
          billing_period,
          result.reference,
          result.amount / 100, // Convert from kobo
          result.authorization?.reusable ? result.authorization.authorization_code : undefined,
          result.customerEmail,
          result.authorization?.card_type,
          result.authorization?.last4,
        );
      }
    }

    return { received: true };
  }

  @Get('paystack/verify/:reference')
  @Public()
  @ApiOperation({ summary: 'Verify a payment by reference' })
  @ApiResponse({ status: 200, description: 'Payment verification result' })
  async verifyTransaction(@Param('reference') reference: string) {
    return this.paystackService.verifyTransaction(reference);
  }
}
