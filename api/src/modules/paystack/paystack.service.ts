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
    vendor_id?: string;
    user_id?: string;
    requested_amount?: number;
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

  // Fallback platform split percentage set on the vendor subaccount at creation time.
  // Real vendor payouts override this per-transaction via `transaction_charge` (see
  // initializeVendorPayout), computed to exactly cover Paystack's actual fee for that
  // specific amount — a fixed percentage alone isn't reliable, since Paystack's fee has a
  // flat +₦100 component above ₦2,500 that a flat percentage margin can fall short of at
  // realistic payout amounts. This constant only matters as a safety default for this
  // subaccount if a charge is ever initialized without an explicit transaction_charge, and
  // must stay non-zero: a 0% main-account split silently shifts Paystack's transaction fee
  // onto the vendor's share instead of the platform's, regardless of `bearer`.
  private readonly VENDOR_PAYOUT_PLATFORM_SPLIT_PERCENT = 2;

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

  /**
   * Provisions a Paystack subaccount for a vendor so vendor payouts can be routed to it via
   * transaction split (Option B: subaccount + split, not a debit-then-transfer pass-through).
   * `percentage_charge` is intentionally non-zero — see VENDOR_PAYOUT_PLATFORM_SPLIT_PERCENT.
   */
  async createVendorSubaccount(vendorId: string, organizationId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, organizationId },
    });

    if (!vendor) {
      throw new BadRequestException('Vendor not found');
    }

    if (!vendor.bankCode || !vendor.bankAccountNumber) {
      throw new BadRequestException('Vendor is missing bank details');
    }

    // Verify the account before provisioning a subaccount for it
    const verification = await this.verifyBankAccount({
      accountNumber: vendor.bankAccountNumber,
      bankCode: vendor.bankCode,
    });

    let subaccountCode = vendor.paystackSubaccountCode;
    let status: 'PENDING' | 'ACTIVE' | 'FAILED' = 'PENDING';
    const isNewSubaccount = !subaccountCode;

    if (this.isMockMode) {
      if (!subaccountCode) {
        subaccountCode = 'ACCT_VND_MOCK_' + Math.random().toString(36).substring(7).toUpperCase();
      }
      // In mock mode there's no real dashboard-approval gate to wait on
      status = 'ACTIVE';
    } else {
      if (subaccountCode) {
        await this.makeRequest<any>(`/subaccount/${subaccountCode}`, 'PUT', {
          settlement_bank: vendor.bankCode,
          account_number: vendor.bankAccountNumber,
          percentage_charge: this.VENDOR_PAYOUT_PLATFORM_SPLIT_PERCENT,
        });
      } else {
        const subaccount = await this.makeRequest<PaystackSubaccount>('/subaccount', 'POST', {
          business_name: vendor.name,
          bank_code: vendor.bankCode,
          account_number: vendor.bankAccountNumber,
          percentage_charge: this.VENDOR_PAYOUT_PLATFORM_SPLIT_PERCENT,
        });
        subaccountCode = subaccount.subaccount_code;
      }
    }

    await this.prisma.vendor.update({
      where: { id: vendorId },
      data: {
        bankAccountNumber: vendor.bankAccountNumber,
        bankName: verification.account_name,
        isBankVerified: true,
        paystackSubaccountCode: subaccountCode,
        paystackSubaccountStatus: status,
      },
    });

    if (!this.isMockMode) {
      this.logger.warn(
        `[ACTION REQUIRED] New Paystack subaccount created (${subaccountCode}) for vendor "${vendor.name}". ` +
        `A brand-new subaccount's first payout is held by Paystack pending manual review — confirm activation in the ` +
        `Paystack Dashboard before relying on same-day payouts to this vendor.`,
      );

      if (isNewSubaccount) {
        const opsEmail = this.configService.get<string>('app.platformOpsEmail');
        if (opsEmail) {
          const organization = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: { name: true },
          });
          this.emailService
            .sendVendorPayoutReviewNeededEmail(opsEmail, vendor.name, organization?.name ?? organizationId, subaccountCode!)
            .catch((err) => this.logger.error(`Failed to send vendor payout review email: ${err.message}`));
        } else {
          this.logger.warn('PLATFORM_OPS_EMAIL is not set — no ops notification sent for this new vendor subaccount.');
        }
      }
    }

    return {
      subaccountCode,
      accountName: verification.account_name,
      status,
    };
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

  /**
   * Initializes a vendor payout (Option B: subaccount + split). The paying organization
   * authorizes a fresh per-transaction checkout (bank transfer / pay-with-bank) — there is no
   * stored mandate — and the split routes the vendor's exact requested amount straight to
   * their subaccount via Paystack's own settlement, so the principal never lands in Kulode's
   * balance.
   */
  async initializeVendorPayout(
    organizationId: string,
    vendorId: string,
    amount: number,
    userId: string,
    userEmail: string,
  ): Promise<{ paymentUrl: string; reference: string }> {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, organizationId },
    });

    if (!vendor) {
      throw new BadRequestException('Vendor not found');
    }

    if (!vendor.paystackSubaccountCode || vendor.paystackSubaccountStatus !== 'ACTIVE') {
      throw new BadRequestException('Vendor is not yet set up for payouts');
    }

    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const reference = `VNDPAY-${vendor.id.slice(0, 8)}-${Date.now()}`;

    // Gross up using the exact same fee formula already proven correct for inbound invoice
    // collection — solves for the gross amount such that Paystack's actual fee, once deducted,
    // leaves precisely `amount` behind. A flat percentage margin isn't reliable here: Paystack's
    // fee has a flat +₦100 component above ₦2,500 that a fixed percentage can fall short of at
    // realistic payout amounts (confirmed in production — see 2026-07-14 incident).
    const grossAmount = this.calculateGrossAmount(amount);
    const feeAmount = grossAmount - amount;
    // Small buffer against kobo-level rounding, so the main account's cut never rounds negative.
    const FEE_BUFFER = 1;
    const mainAccountChargeKobo = Math.round((feeAmount + FEE_BUFFER) * 100);

    let authorization_url = `http://localhost:5173/payment/callback?reference=${reference}`;

    if (!this.isMockMode) {
      const result = await this.makeRequest<{
        authorization_url: string;
        access_code: string;
        reference: string;
      }>('/transaction/initialize', 'POST', {
        email: userEmail,
        amount: Math.round(grossAmount * 100), // Convert to kobo
        reference,
        callback_url: this.callbackUrl,
        subaccount: vendor.paystackSubaccountCode,
        // Overrides the subaccount's default percentage_charge for this specific transaction,
        // so the main account's split share is always exactly enough to cover the real fee for
        // this amount, rather than a flat percentage that only works below the ₦2,500 threshold.
        transaction_charge: mainAccountChargeKobo,
        bearer: 'account',
        channels: ['bank_transfer', 'bank'],
        metadata: {
          type: 'vendor_payout',
          vendor_id: vendorId,
          organization_id: organizationId,
          user_id: userId,
          requested_amount: amount,
        },
      });
      authorization_url = result.authorization_url;
    }

    return {
      paymentUrl: authorization_url,
      reference,
    };
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
        metadata?: PaystackTransaction['metadata'] & { invoice_number?: string };
      }>(`/transaction/verify/${reference}`);

      if (data.status === 'success') {
        if (data.metadata?.type === 'vendor_payout') {
          await this.reconcileVendorPayout(reference, {
            amount: data.amount,
            paid_at: data.paid_at || new Date().toISOString(),
            fees: data.fees || 0,
            metadata: data.metadata,
          });
        } else {
          await this.reconcilePayment(reference, {
            amount: data.amount,
            channel: data.channel || 'card',
            paid_at: data.paid_at || new Date().toISOString(),
            fees: data.fees || 0,
            metadata: data.metadata,
          });
        }
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

  /**
   * Reconciles a vendor payout (Option B) on `charge.success` by creating the corresponding
   * Expense row directly — there is no separate transfer step to wait on, since the split
   * routed the vendor's share via Paystack's own settlement as part of this same transaction.
   */
  async reconcileVendorPayout(reference: string, data: {
    amount: number;
    paid_at: string;
    fees: number;
    metadata?: PaystackTransaction['metadata'];
  }) {
    const existing = await this.prisma.expense.findFirst({
      where: { paystackReference: reference },
    });

    if (existing) {
      this.logger.log(`Vendor payout for reference ${reference} already reconciled, skipping.`);
      return { success: true, alreadyProcessed: true };
    }

    const { vendor_id, organization_id, user_id, requested_amount } = data.metadata ?? {};

    if (!vendor_id || !organization_id || !user_id) {
      this.logger.error(`Vendor payout webhook missing required metadata for reference ${reference}`);
      return { success: false, reason: 'Missing vendor payout metadata' };
    }

    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendor_id, organizationId: organization_id },
    });

    if (!vendor) {
      this.logger.error(`Vendor payout reconciliation failed: vendor ${vendor_id} not found for reference ${reference}`);
      return { success: false, reason: 'Vendor not found' };
    }

    const netAmount = requested_amount ?? data.amount / 100;
    const paystackFees = data.fees / 100;

    await this.prisma.$transaction(async (tx) => {
      const doubleCheck = await tx.expense.findFirst({
        where: { paystackReference: reference },
      });
      if (doubleCheck) return;

      await tx.expense.create({
        data: {
          organizationId: organization_id,
          vendorId: vendor_id,
          recordedById: user_id,
          description: `Payment to ${vendor.name}`,
          amount: netAmount,
          expenseDate: new Date(data.paid_at),
          recipient: vendor.name,
          paymentMethod: 'PAYSTACK',
          reference,
          isAutoRecorded: true,
          paystackReference: reference,
          paystackFees,
          netAmount,
        },
      });
    });

    this.logger.log(`Vendor payout recorded as expense for vendor "${vendor.name}" (ref ${reference})`);
    return { success: true };
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

    // Vendor payouts (Option B: subaccount + split) reconcile straight to an Expense row —
    // no separate transfer step to wait on.
    if (metadata?.type === 'vendor_payout') {
      const result = await this.reconcileVendorPayout(reference, data);
      return { received: true, success: result.success, reason: (result as { reason?: string }).reason };
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
