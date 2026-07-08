import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubaccountDto, VerifyBankAccountDto } from './dto';
import { createHmac, timingSafeEqual } from 'crypto';
import { InventoryService } from '../inventory/inventory.service';
import { EmailService } from '../email/email.service';

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
  authorization?: {
    authorization_code: string;
    card_type: string;
    last4: string;
    reusable: boolean;
  };
  customer?: {
    email: string;
  };
}

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly callbackUrl: string;
  public readonly publicKey: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private emailService: EmailService,
  ) {
    this.baseUrl = this.configService.get<string>('paystack.baseUrl') || 'https://api.paystack.co';
    this.secretKey = this.configService.get<string>('paystack.secretKey') || '';
    this.publicKey = this.configService.get<string>('paystack.publicKey') || '';
    this.callbackUrl = this.configService.get<string>('paystack.callbackUrl') || 'http://localhost:5173/payment/callback';
  }

  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' = 'GET',
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

  private get isMockMode(): boolean {
    return !this.secretKey || this.secretKey.includes('xxxx');
  }

  async getBanks(): Promise<PaystackBank[]> {
    if (this.isMockMode) {
      return [
        { name: 'Access Bank', code: '044' },
        { name: 'Guaranty Trust Bank', code: '058' },
        { name: 'Zenith Bank', code: '057' },
        { name: 'United Bank for Africa', code: '033' },
        { name: 'First Bank of Nigeria', code: '011' },
      ];
    }
    return this.makeRequest<PaystackBank[]>('/bank?country=nigeria');
  }

  async verifyBankAccount(dto: VerifyBankAccountDto): Promise<PaystackAccountVerification> {
    const { accountNumber, bankCode } = dto;
    if (this.isMockMode) {
      return {
        account_number: accountNumber,
        account_name: 'Acme Corp Settlement Account',
        bank_id: 1,
      };
    }
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

    let subaccountCode = organization.paystackSubaccountCode;

    if (this.isMockMode) {
      if (!subaccountCode) {
        subaccountCode = 'ACCT_MOCK_' + Math.random().toString(36).substring(7).toUpperCase();
      }
    } else {
      if (subaccountCode) {
        // Update existing subaccount on Paystack
        await this.makeRequest<any>(`/subaccount/${subaccountCode}`, 'PUT', {
          settlement_bank: dto.bankCode,
          account_number: dto.accountNumber,
        });
      } else {
        // Create new subaccount on Paystack
        const subaccount = await this.makeRequest<PaystackSubaccount>('/subaccount', 'POST', {
          business_name: organization.name,
          bank_code: dto.bankCode,
          account_number: dto.accountNumber,
          percentage_charge: Number(organization.platformFeePercent),
        });
        subaccountCode = subaccount.subaccount_code;
      }
    }

    // Update organization with subaccount details
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        paystackSubaccountCode: subaccountCode,
        bankCode: dto.bankCode,
        bankAccountNumber: dto.accountNumber,
        bankAccountName: verification.account_name,
        settlementBank: bank?.name || 'Unknown Bank',
        isPaystackVerified: true,
      },
    });

    this.logger.warn(
      `[ACTION REQUIRED] New Paystack subaccount created (${subaccountCode}) for organization "${organization.name}". ` +
      `You must manually log into the Paystack Dashboard and approve this subaccount to activate payouts.`
    );

    return {
      subaccountCode,
      accountName: verification.account_name,
      accountNumber: dto.accountNumber,
      bankName: bank?.name || 'Unknown Bank',
    };
  }

  async disconnectSubaccount(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new BadRequestException('Organization not found');
    }

    // Clear db fields
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        paystackSubaccountCode: null,
        bankCode: null,
        bankAccountNumber: null,
        bankAccountName: null,
        settlementBank: null,
        isPaystackVerified: false,
      },
    });

    return { success: true };
  }

  calculateGrossAmount(netAmount: number): number {
    // Paystack local fee: 1.5% + NGN 100.
    // NGN 100 flat fee is waived if the gross amount is under NGN 2,500.
    // Max fee is NGN 2,000.
    // Case 1: Gross < 2,500 (Net < 2462.50)
    //   X - 0.015 * X = Net => 0.985 * X = Net => X = Net / 0.985
    // Case 2: Gross >= 2,500 (Net >= 2462.50)
    //   X - (0.015 * X + 100) = Net => 0.985 * X - 100 = Net => X = (Net + 100) / 0.985
    let gross = netAmount;
    if (netAmount < 2462.50) {
      gross = netAmount / 0.985;
    } else {
      gross = (netAmount + 100) / 0.985;
    }
    const fee = gross - netAmount;
    if (fee > 2000) {
      gross = netAmount + 2000;
    }
    return Math.round(gross * 100) / 100;
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

    // Get invoice (scoped to the caller's organization)
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: {
        client: { select: { name: true, email: true } },
        organization: { select: { name: true } },
        installments: { select: { id: true } },
      },
    });

    if (!invoice) {
      throw new BadRequestException('Invoice not found');
    }

    if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot generate a payment link for a ${invoice.status.toLowerCase()} invoice`);
    }

    if (invoice.installments.length > 0) {
      throw new BadRequestException(
        'This invoice uses a payment schedule. Generate payment links for individual installments instead of the whole invoice.',
      );
    }

    // Generate unique reference
    const reference = `${invoice.invoiceNumber}-${Date.now()}`;

    // Calculate gross amount to charge client's customer (convenience fee included)
    const grossAmount = this.calculateGrossAmount(amount);

    let authorization_url = `http://localhost:5173/payment/callback?reference=${reference}`;
    let access_code = 'MOCK_ACCESS_CODE';

    if (!this.isMockMode) {
      const result = await this.makeRequest<{
        authorization_url: string;
        access_code: string;
        reference: string;
      }>('/transaction/initialize', 'POST', {
        email,
        amount: Math.round(grossAmount * 100), // Convert to kobo
        reference,
        callback_url: this.callbackUrl,
        subaccount: organization.paystackSubaccountCode,
        bearer: 'subaccount', // Subaccount bears Paystack fees
        channels: ['bank_transfer', 'card', 'bank', 'ussd', 'qr', 'mobile_money'],
        metadata: {
          invoice_id: invoiceId,
          organization_id: organizationId,
          invoice_number: invoice.invoiceNumber,
        },
      });
      authorization_url = result.authorization_url;
      access_code = result.access_code;
    }

    // Update invoice with payment link and transition DRAFT → SENT
    const wasDraft = invoice.status === 'DRAFT';
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paystackReference: reference,
        paystackAccessCode: access_code,
        paymentUrl: authorization_url,
        paystackTokenGeneratedAt: new Date(),
        ...(wasDraft && { status: 'SENT' }),
      },
    });

    if (wasDraft && invoice.client.email) {
      const dueDate = invoice.dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const total = Number(invoice.total).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });

      try {
        await this.emailService.sendInvoiceEmail(
          invoice.client.email,
          invoice.client.name,
          invoice.invoiceNumber,
          invoice.organization.name,
          total,
          dueDate,
          authorization_url,
        );
      } catch (err) {
        this.logger.error(`Failed to send invoice email for ${invoice.invoiceNumber}: ${err.message}`);
      }
    }

    return {
      paymentUrl: authorization_url,
      reference,
      accessCode: access_code,
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

    // Get invoice (scoped to the caller's organization)
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
    });

    if (!invoice) {
      throw new BadRequestException('Invoice not found');
    }

    if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot generate a payment link for a ${invoice.status.toLowerCase()} invoice`);
    }

    // Get installment (scoped to the invoice above)
    const installment = await this.prisma.paymentInstallment.findFirst({
      where: { id: installmentId, invoiceId },
    });

    if (!installment) {
      throw new BadRequestException('Installment not found');
    }

    // Generate unique reference
    const reference = `${invoice.invoiceNumber}-INST${installment.sequence}-${Date.now()}`;

    // Calculate gross amount to charge client's customer (convenience fee included)
    const grossAmount = this.calculateGrossAmount(amount);

    let authorization_url = `http://localhost:5173/payment/callback?reference=${reference}`;
    let access_code = 'MOCK_ACCESS_CODE';

    if (!this.isMockMode) {
      const result = await this.makeRequest<{
        authorization_url: string;
        access_code: string;
        reference: string;
      }>('/transaction/initialize', 'POST', {
        email,
        amount: Math.round(grossAmount * 100), // Convert to kobo
        reference,
        callback_url: this.callbackUrl,
        subaccount: organization.paystackSubaccountCode,
        bearer: 'subaccount',
        channels: ['bank_transfer', 'card', 'bank', 'ussd', 'qr', 'mobile_money'],
        metadata: {
          invoice_id: invoiceId,
          organization_id: organizationId,
          invoice_number: invoice.invoiceNumber,
          installment_id: installmentId,
          installment_label: installment.label,
        },
      });
      authorization_url = result.authorization_url;
      access_code = result.access_code;
    }

    // Update installment with payment link
    await this.prisma.paymentInstallment.update({
      where: { id: installmentId },
      data: {
        paystackReference: reference,
        paystackAccessCode: access_code,
        paymentUrl: authorization_url,
        paystackTokenGeneratedAt: new Date(),
      },
    });

    return {
      paymentUrl: authorization_url,
      reference,
    };
  }

  async chargeAuthorization(
    email: string,
    amountInKobo: number,
    authorizationCode: string,
    reference: string,
    metadata: Record<string, unknown>,
  ): Promise<{ success: boolean; reference: string }> {
    try {
      const data = await this.makeRequest<{ status: string; reference: string }>(
        '/transaction/charge_authorization',
        'POST',
        {
          email,
          amount: amountInKobo,
          authorization_code: authorizationCode,
          reference,
          metadata,
        },
      );
      return { success: data.status === 'success', reference: data.reference };
    } catch (error) {
      this.logger.error(`chargeAuthorization failed for ref ${reference}`, error);
      return { success: false, reference };
    }
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const hash = createHmac('sha512', this.secretKey)
      .update(payload)
      .digest('hex');
    
    try {
      const hashBuffer = Buffer.from(hash, 'hex');
      const sigBuffer = Buffer.from(signature, 'hex');
      
      if (hashBuffer.length !== sigBuffer.length) {
        return false;
      }
      return timingSafeEqual(hashBuffer, sigBuffer);
    } catch {
      return false;
    }
  }

  async verifyTransaction(reference: string) {
    try {
      const data = await this.makeRequest<{
        status: string;
        amount: number;
        currency: string;
        reference: string;
        fees?: number;
        channel?: string;
        paid_at?: string;
        metadata?: {
          invoice_number?: string;
        };
      }>(`/transaction/verify/${reference}`);

      if (data.status === 'success') {
        await this.reconcilePayment(reference, {
          amount: data.amount,
          channel: data.channel || 'card',
          paid_at: data.paid_at || new Date().toISOString(),
          fees: data.fees || 0,
          metadata: data.metadata,
        });
      }

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

  async reconcilePayment(reference: string, data: {
    amount: number;
    channel: string;
    paid_at: string;
    fees: number;
    metadata?: any;
    authorization?: any;
    customer?: { email: string };
  }) {
    // Idempotency Check: check if payment record already exists
    const existingPayment = await this.prisma.payment.findFirst({
      where: { paystackReference: reference },
    });

    if (existingPayment) {
      this.logger.log(`Payment for reference ${reference} already reconciled, skipping.`);
      return { success: true, alreadyProcessed: true };
    }

    const { amount, channel, paid_at, fees } = data;

    // Check if this is an installment payment
    const installment = await this.prisma.paymentInstallment.findFirst({
      where: { paystackReference: reference },
      include: {
        invoice: {
          include: {
            organization: {
              include: {
                users: {
                  where: { isActive: true },
                },
              },
            },
            client: true,
          },
        },
      },
    });

    if (installment) {
      const invoice = installment.invoice;
      const amountInNaira = amount / 100;
      const paystackFees = fees / 100;
      const platformFees = amountInNaira * (Number(invoice.organization.platformFeePercent) / 100);
      const netAmount = amountInNaira - paystackFees - platformFees;
      let outstandingAmountString = '';

      await this.prisma.$transaction(async (tx) => {
        // Double check within transaction
        const doubleCheck = await tx.payment.findFirst({
          where: { paystackReference: reference },
        });
        if (doubleCheck) return;

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
        outstandingAmountString = Math.max(0, Number(invoice.total) - newAmountPaid).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            amountPaid: newAmountPaid,
            status: newStatus,
            paystackPaidAt: new Date(paid_at),
            paystackChannel: channel,
          },
        });

        // Deduct inventory stock if invoice is now fully PAID
        if (newStatus === 'PAID') {
          await this.inventoryService.deductOnPayment(tx, invoice.id, invoice.organizationId);
        }
      });

      this.logger.log(`Installment payment recorded for invoice ${invoice.invoiceNumber}`);

      // Send notifications asynchronously
      this.sendPaymentNotifications(invoice, amountInNaira, outstandingAmountString, channel, paid_at).catch(err => {
        this.logger.error(`Failed to send installment payment notifications: ${err.message}`);
      });

      return { success: true };
    }

    // Fall back to regular invoice payment
    const invoice = await this.prisma.invoice.findFirst({
      where: { paystackReference: reference },
      include: {
        organization: {
          include: {
            users: {
              where: { isActive: true },
            },
          },
        },
        client: true,
      },
    });

    if (!invoice) {
      this.logger.error(
        `Paystack payment reconciliation failed: no invoice/installment found for reference "${reference}" ` +
          `(metadata.invoice_id: ${data.metadata?.invoice_id ?? 'none'}). ` +
          `Payment was likely successful on Paystack but could not be applied to any invoice.`,
      );
      return { success: false, reason: 'Invoice not found' };
    }

    // Calculate fees and net amount
    const amountInNaira = amount / 100;
    const paystackFees = fees / 100;
    const platformFees = amountInNaira * (Number(invoice.organization.platformFeePercent) / 100);
    const netAmount = amountInNaira - paystackFees - platformFees;
    let outstandingAmountString = '';

    // Record payment in transaction
    await this.prisma.$transaction(async (tx) => {
      // Double check within transaction
      const doubleCheck = await tx.payment.findFirst({
        where: { paystackReference: reference },
      });
      if (doubleCheck) return;

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
      outstandingAmountString = Math.max(0, Number(invoice.total) - newAmountPaid).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });

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

      // Deduct inventory stock if invoice is now fully PAID
      if (newStatus === 'PAID') {
        await this.inventoryService.deductOnPayment(tx, invoice.id, invoice.organizationId);
      }
    });

    this.logger.log(`Payment recorded for invoice ${invoice.invoiceNumber}`);

    // Send notifications asynchronously
    this.sendPaymentNotifications(invoice, amountInNaira, outstandingAmountString, channel, paid_at).catch(err => {
      this.logger.error(`Failed to send payment notifications: ${err.message}`);
    });

    return { success: true };
  }

  private async sendPaymentNotifications(
    invoice: any,
    amountPaid: number,
    outstandingAmount: string,
    channel: string,
    paidAt: string,
  ) {
    if (!invoice) return;

    const formattedAmount = amountPaid.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
    const formattedPaymentDate = new Date(paidAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    // Format payment channel for presentation (e.g. bank_transfer -> Bank Transfer)
    const cleanChannel = channel
      ? channel
          .split('_')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
      : 'Card';

    // 1. Send receipt to Client
    if (invoice.client?.email) {
      try {
        await this.emailService.sendPaymentReceiptEmail(
          invoice.client.email,
          invoice.client.name,
          invoice.invoiceNumber,
          invoice.organization.name,
          formattedAmount,
          outstandingAmount,
          formattedPaymentDate,
          cleanChannel,
        );
      } catch (err) {
        this.logger.error(`Failed to send payment receipt email to client ${invoice.client.email}: ${err.message}`);
      }
    }

    // 2. Send alert to Merchant (Org Admins/Users)
    const merchantEmails: string[] = [];
    if (invoice.organization.email) {
      merchantEmails.push(invoice.organization.email);
    }
    if (invoice.organization.users && invoice.organization.users.length > 0) {
      const admins = invoice.organization.users.filter((u: any) => u.role === 'SUPER_ADMIN' || u.role === 'ADMIN');
      const targets = admins.length > 0 ? admins : invoice.organization.users;
      targets.forEach((u: any) => {
        if (u.email && !merchantEmails.includes(u.email)) {
          merchantEmails.push(u.email);
        }
      });
    }

    const merchantName = invoice.organization.name;
    const settlementStatus = invoice.organization.paystackSubaccountCode ? 'Pending Settlement' : 'Direct Deposit';

    for (const email of merchantEmails) {
      try {
        await this.emailService.sendMerchantPaymentAlertEmail(
          email,
          merchantName,
          invoice.client?.name || 'Client',
          invoice.invoiceNumber,
          formattedAmount,
          cleanChannel,
          settlementStatus,
          formattedPaymentDate,
        );
      } catch (err) {
        this.logger.error(`Failed to send merchant payment alert to ${email}: ${err.message}`);
      }
    }
  }

  async handleWebhookEvent(event: string, data: PaystackTransaction) {
    if (event !== 'charge.success') {
      return { received: true };
    }

    const { reference, amount, paid_at, metadata } = data;

    // Route subscription payments to be handled externally
    if (metadata?.type === 'subscription') {
      this.logger.log(`Subscription payment received: ${reference}`);
      return {
        received: true,
        type: 'subscription',
        metadata,
        amount,
        reference,
        authorization: data.authorization,
        customerEmail: data.customer?.email,
      };
    }

    if (!metadata?.invoice_id) {
      this.logger.warn(`Webhook received without invoice_id: ${reference}`);
      return { received: true };
    }

    // Delegate to unified reconciliation method
    const result = await this.reconcilePayment(reference, data);
    return { received: true, success: result.success, reason: (result as { reason?: string }).reason };
  }
}
