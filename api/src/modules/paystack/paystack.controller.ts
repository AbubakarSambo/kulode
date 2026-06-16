import {
  Controller,
  Get,
  Post,
  Delete,
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
import { PaystackService, PaystackTransaction } from './paystack.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { CreateSubaccountDto, VerifyBankAccountDto } from './dto';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Public, Roles, Role } from '../../common';

@ApiTags('Paystack')
@Controller()
export class PaystackController {
  private readonly logger = new Logger(PaystackController.name);

  constructor(
    private readonly paystackService: PaystackService,
    private readonly subscriptionService: SubscriptionService,
    private readonly prisma: PrismaService,
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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
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

  @Post('paystack/simulate-success')
  @Public()
  @ApiOperation({ summary: 'Simulate successful payment for local development' })
  async simulateSuccess(@Body() body: { reference: string }) {
    if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
      throw new BadRequestException('Simulation only available in development environment');
    }

    const { reference } = body;
    if (!reference) {
      throw new BadRequestException('Reference is required');
    }

    // Try finding installment first
    const installment = await this.prisma.paymentInstallment.findFirst({
      where: { paystackReference: reference },
      include: { invoice: true },
    });

    let amount = 0;
    let metadata: PaystackTransaction['metadata'] = {};

    if (installment) {
      amount = Number(installment.amount) * 100; // in kobo
      metadata = {
        invoice_id: installment.invoiceId,
      };
    } else {
      const invoice = await this.prisma.invoice.findFirst({
        where: { paystackReference: reference },
      });
      if (!invoice) {
        throw new BadRequestException('Invoice or installment not found for reference ' + reference);
      }
      const balanceDue = Number(invoice.total) - Number(invoice.amountPaid);
      amount = balanceDue * 100; // in kobo
      metadata = {
        invoice_id: invoice.id,
      };
    }

    const mockPayload: PaystackTransaction = {
      reference,
      amount,
      currency: 'NGN',
      channel: 'bank_transfer',
      paid_at: new Date().toISOString(),
      fees: 0,
      metadata,
    };

    return this.paystackService.handleWebhookEvent('charge.success', mockPayload);
  }

  @Delete('organizations/disconnect-paystack')
  @ApiBearerAuth()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Disconnect Paystack integration' })
  @ApiResponse({ status: 200, description: 'Paystack disconnected' })
  async disconnectPaystack(
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.paystackService.disconnectSubaccount(organizationId);
  }
}
