import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubaccountDto, VerifyBankAccountDto } from './dto';
import { createHmac } from 'crypto';

export interface PaystackBank {
  name: string;
  code: string;
}

export interface PaystackAccountVerification {
  account_number: string;
  account_name: string;
  bank_id: number;
}

export interface PaystackSubaccount {
  subaccount_code: string;
  business_name: string;
  settlement_bank: string;
  account_number: string;
}

export interface PaystackTransaction {
  reference: string;
  amount: number;
  currency: string;
  channel: string;
  paid_at: string;
  fees: number;
  metadata: {
    type?: string;
    invoice_id?: string;
    organization_id?: string;
    plan_tier?: string;
    billing_period?: string;
  };
}

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly callbackUrl: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.baseUrl = this.configService.get<string>('paystack.baseUrl') || 'https://api.paystack.co';
    this.secretKey = this.configService.get<string>('paystack.secretKey') || '';
    this.callbackUrl = this.configService.get<string>('paystack.callbackUrl') || 'http://localhost:5173/payment/callback';
  }

  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: any,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        throw new BadRequestException(data.message || 'Paystack API error');
      }

      return data.data as T;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Paystack API error', error);
      throw new InternalServerErrorException('Failed to communicate with Paystack');
    }
  }

  async getBanks(): Promise<PaystackBank[]> {
    return this.makeRequest<PaystackBank[]>('/bank?country=nigeria');
  }

  async verifyBankAccount(dto: VerifyBankAccountDto): Promise<PaystackAccountVerification> {
    const { accountNumber, bankCode } = dto;
    return this.makeRequest<PaystackAccountVerification>(
      `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
    );
  }

  async createSubaccount(organizationId: string, dto: CreateSubaccountDto) {
    // First verify the account
    const verification = await this.verifyBankAccount({
      accountNumber: dto.accountNumber,
      bankCode: dto.bankCode,
    });

    // Get organization
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new BadRequestException('Organization not found');
    }

    // Get bank name
    const banks = await this.getBanks();
    const bank = banks.find((b) => b.code === dto.bankCode);

    // Create subaccount on Paystack
    const subaccount = await this.makeRequest<PaystackSubaccount>('/subaccount', 'POST', {
      business_name: organization.name,
      bank_code: dto.bankCode,
      account_number: dto.accountNumber,
      percentage_charge: Number(organization.platformFeePercent),
    });

    // Update organization with subaccount details
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        paystackSubaccountCode: subaccount.subaccount_code,
        bankCode: dto.bankCode,
        bankAccountNumber: dto.accountNumber,
        bankAccountName: verification.account_name,
        settlementBank: bank?.name || subaccount.settlement_bank,
        isPaystackVerified: true,
      },
    });

    return {
      subaccountCode: subaccount.subaccount_code,
      accountName: verification.account_name,
      accountNumber: dto.accountNumber,
      bankName: bank?.name || subaccount.settlement_bank,
    };
  }

  async initializeTransaction(
    organizationId: string,
    invoiceId: string,
    email: string,
    amount: number,
  ) {
    // Get organization for subaccount
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization?.paystackSubaccountCode) {
      throw new BadRequestException('Paystack subaccount not set up');
    }

    // Get invoice
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new BadRequestException('Invoice not found');
    }

    // Generate unique reference
    const reference = `${invoice.invoiceNumber}-${Date.now()}`;

    const result = await this.makeRequest<{
      authorization_url: string;
      access_code: string;
      reference: string;
    }>('/transaction/initialize', 'POST', {
      email,
      amount: Math.round(amount * 100), // Convert to kobo
      reference,
      callback_url: this.callbackUrl,
      subaccount: organization.paystackSubaccountCode,
      bearer: 'subaccount', // Subaccount bears Paystack fees
      metadata: {
        invoice_id: invoiceId,
        organization_id: organizationId,
        invoice_number: invoice.invoiceNumber,
      },
    });

    // Update invoice with payment link and transition DRAFT → SENT
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paystackReference: result.reference,
        paystackAccessCode: result.access_code,
        paymentUrl: result.authorization_url,
        ...(invoice.status === 'DRAFT' && { status: 'SENT' }),
      },
    });

    return {
      paymentUrl: result.authorization_url,
      reference: result.reference,
      accessCode: result.access_code,
    };
  }

  async initializeInstallmentTransaction(
    organizationId: string,
    invoiceId: string,
    installmentId: string,
    email: string,
    amount: number,
  ) {
    // Get organization for subaccount
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization?.paystackSubaccountCode) {
      throw new BadRequestException('Paystack subaccount not set up');
    }

    // Get invoice
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new BadRequestException('Invoice not found');
    }

    // Get installment
    const installment = await this.prisma.paymentInstallment.findUnique({
      where: { id: installmentId },
    });

    if (!installment) {
      throw new BadRequestException('Installment not found');
    }

    // Generate unique reference
    const reference = `${invoice.invoiceNumber}-INST${installment.sequence}-${Date.now()}`;

    const result = await this.makeRequest<{
      authorization_url: string;
      access_code: string;
      reference: string;
    }>('/transaction/initialize', 'POST', {
      email,
      amount: Math.round(amount * 100), // Convert to kobo
      reference,
      callback_url: this.callbackUrl,
      subaccount: organization.paystackSubaccountCode,
      bearer: 'subaccount',
      metadata: {
        invoice_id: invoiceId,
        organization_id: organizationId,
        invoice_number: invoice.invoiceNumber,
        installment_id: installmentId,
        installment_label: installment.label,
      },
    });

    // Update installment with payment link
    await this.prisma.paymentInstallment.update({
      where: { id: installmentId },
      data: {
        paystackReference: result.reference,
        paystackAccessCode: result.access_code,
        paymentUrl: result.authorization_url,
      },
    });

    return {
      paymentUrl: result.authorization_url,
      reference: result.reference,
    };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const hash = createHmac('sha512', this.secretKey)
      .update(payload)
      .digest('hex');
    return hash === signature;
  }

  async verifyTransaction(reference: string) {
    try {
      const data = await this.makeRequest<{
        status: string;
        amount: number;
        currency: string;
        reference: string;
        metadata?: {
          invoice_number?: string;
        };
      }>(`/transaction/verify/${reference}`);

      return {
        status: data.status,
        amount: data.amount / 100, // Convert from kobo
        currency: data.currency,
        reference: data.reference,
        invoiceNumber: data.metadata?.invoice_number,
      };
    } catch (error) {
      this.logger.error(`Failed to verify transaction ${reference}`, error);
      throw error;
    }
  }

  async handleWebhookEvent(event: string, data: PaystackTransaction) {
    if (event !== 'charge.success') {
      return { received: true };
    }

    const { reference, amount, channel, paid_at, fees, metadata } = data;

    // Route subscription payments to be handled externally
    if (metadata?.type === 'subscription') {
      this.logger.log(`Subscription payment received: ${reference}`);
      return {
        received: true,
        type: 'subscription',
        metadata,
        amount,
        reference,
      };
    }

    if (!metadata?.invoice_id) {
      this.logger.warn(`Webhook received without invoice_id: ${reference}`);
      return { received: true };
    }

    // Check if this is an installment payment
    const installment = await this.prisma.paymentInstallment.findFirst({
      where: { paystackReference: reference },
      include: { invoice: { include: { organization: true } } },
    });

    if (installment) {
      // Handle installment payment
      const invoice = installment.invoice;
      const amountInNaira = amount / 100;
      const paystackFees = fees / 100;
      const platformFees = amountInNaira * (Number(invoice.organization.platformFeePercent) / 100);
      const netAmount = amountInNaira - paystackFees - platformFees;

      await this.prisma.$transaction(async (tx) => {
        // Create payment record
        await tx.payment.create({
          data: {
            organizationId: invoice.organizationId,
            invoiceId: invoice.id,
            amount: amountInNaira,
            paymentMethod: 'PAYSTACK',
            paymentDate: new Date(paid_at),
            paystackReference: reference,
            paystackFees,
            platformFees,
            netAmount,
            isAutoRecorded: true,
          },
        });

        // Mark installment as paid
        await tx.paymentInstallment.update({
          where: { id: installment.id },
          data: {
            isPaid: true,
            paidAt: new Date(paid_at),
          },
        });

        // Update invoice
        const newAmountPaid = Number(invoice.amountPaid) + amountInNaira;
        const newStatus = newAmountPaid >= Number(invoice.total) ? 'PAID' : 'PARTIALLY_PAID';

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            amountPaid: newAmountPaid,
            status: newStatus,
            paystackPaidAt: new Date(paid_at),
            paystackChannel: channel,
          },
        });
      });

      this.logger.log(`Installment payment recorded for invoice ${invoice.invoiceNumber}`);
      return { received: true };
    }

    // Fall back to regular invoice payment
    const invoice = await this.prisma.invoice.findFirst({
      where: { paystackReference: reference },
      include: { organization: true },
    });

    if (!invoice) {
      this.logger.warn(`Invoice not found for reference: ${reference}`);
      return { received: true };
    }

    // Calculate fees and net amount
    const amountInNaira = amount / 100;
    const paystackFees = fees / 100;
    const platformFees = amountInNaira * (Number(invoice.organization.platformFeePercent) / 100);
    const netAmount = amountInNaira - paystackFees - platformFees;

    // Record payment in transaction
    await this.prisma.$transaction(async (tx) => {
      // Create payment record
      await tx.payment.create({
        data: {
          organizationId: invoice.organizationId,
          invoiceId: invoice.id,
          amount: amountInNaira,
          paymentMethod: 'PAYSTACK',
          paymentDate: new Date(paid_at),
          paystackReference: reference,
          paystackFees,
          platformFees,
          netAmount,
          isAutoRecorded: true,
        },
      });

      // Update invoice
      const newAmountPaid = Number(invoice.amountPaid) + amountInNaira;
      const newStatus = newAmountPaid >= Number(invoice.total) ? 'PAID' : 'PARTIALLY_PAID';

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: newAmountPaid,
          status: newStatus,
          paystackPaidAt: new Date(paid_at),
          paystackChannel: channel,
          // Clear payment link so a new one can be generated for next installment
          paymentUrl: null,
          paystackReference: null,
          paystackAccessCode: null,
        },
      });
    });

    this.logger.log(`Payment recorded for invoice ${invoice.invoiceNumber}`);
    return { received: true };
  }
}
