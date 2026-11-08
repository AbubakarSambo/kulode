import {
  Injectable,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { EmailService } from '../email/email.service';
import { PLAN_LIMITS, PLAN_PRICES, TEST_ACCOUNT_PRICE, maxUsersFor, planAmount } from '../../common/plan-limits';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private readonly paystackSecretKey: string;
  private readonly paystackBaseUrl: string;
  private readonly callbackUrl: string;
  private readonly directDebitMaxAmount: number;
  private readonly bankCheckoutEnabled: boolean;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    @Inject(forwardRef(() => PaystackService))
    private paystackService: PaystackService,
    private emailService: EmailService,
  ) {
    this.paystackSecretKey = this.configService.get<string>('paystack.secretKey') || '';
    this.paystackBaseUrl = this.configService.get<string>('paystack.baseUrl') || 'https://api.paystack.co';
    this.callbackUrl = this.configService.get<string>('paystack.callbackUrl') || 'http://localhost:5173/payment/callback';
    this.directDebitMaxAmount = Number(this.configService.get<number>('paystack.directDebitMaxAmount')) || 100000;
    this.bankCheckoutEnabled = this.configService.get<boolean>('paystack.bankCheckoutEnabled') !== false;
  }

  async getCurrentPlan(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        planTier: true,
        subscriptionStatus: true,
        billingPeriod: true,
        trialStartDate: true,
        trialEndDate: true,
        subscriptionStartDate: true,
        subscriptionEndDate: true,
        isGrandfathered: true,
        isTestAccount: true,
        paystackAuthorizationCode: true,
        paystackCardType: true,
        paystackCardLast4: true,
        directDebitStatus: true,
        directDebitBankName: true,
        directDebitAccountLast4: true,
        pendingRenewalReference: true,
        autoRenew: true,
      },
    });

    if (!org) {
      throw new BadRequestException('Organization not found');
    }

    const now = new Date();
    let effectivePlan = org.planTier;
    let trialDaysRemaining: number | null = null;

    if (org.subscriptionStatus === 'TRIALING' && org.trialEndDate) {
      const remaining = Math.ceil((org.trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      trialDaysRemaining = Math.max(0, remaining);
      if (trialDaysRemaining <= 0) {
        effectivePlan = 'FREE';
      }
    }

    if (org.subscriptionStatus === 'EXPIRED') {
      effectivePlan = 'FREE';
    }

    if (org.subscriptionStatus === 'CANCELLED' && org.subscriptionEndDate && now > org.subscriptionEndDate) {
      effectivePlan = 'FREE';
    }

    const limits = PLAN_LIMITS[effectivePlan];

    // Get usage counts
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [invoiceCount, userCount] = await Promise.all([
      this.prisma.invoice.count({
        where: {
          organizationId,
          deletedAt: null,
          createdAt: { gte: startOfMonth },
        },
      }),
      this.prisma.user.count({
        where: { organizationId, isActive: true },
      }),
    ]);

    return {
      planTier: org.planTier,
      effectivePlan,
      subscriptionStatus: org.subscriptionStatus,
      billingPeriod: org.billingPeriod,
      trialEndDate: org.trialEndDate,
      trialDaysRemaining,
      subscriptionStartDate: org.subscriptionStartDate,
      subscriptionEndDate: org.subscriptionEndDate,
      isGrandfathered: org.isGrandfathered,
      autoRenew: org.autoRenew,
      // Test accounts are charged a token amount for any plan (see planAmount).
      isTestAccount: org.isTestAccount,
      testAccountPrice: org.isTestAccount ? TEST_ACCOUNT_PRICE : null,
      paymentMethods: {
        card: org.paystackAuthorizationCode
          ? { type: org.paystackCardType ?? null, last4: org.paystackCardLast4 ?? null }
          : null,
        directDebit: org.directDebitStatus
          ? {
              status: org.directDebitStatus,
              bankName: org.directDebitBankName ?? null,
              last4: org.directDebitAccountLast4 ?? null,
            }
          : null,
        // The largest renewal a bank account is used for; bigger ones (annual plans) stay on the card.
        directDebitMaxAmount: this.directDebitMaxAmount,
        // Whether the Upgrade page may offer "pay from a bank account" (test accounts always may).
        bankFirstPaymentEnabled: this.bankCheckoutEnabled || org.isTestAccount,
        renewalPending: !!org.pendingRenewalReference,
      },
      limits: {
        maxUsers: maxUsersFor(effectivePlan, org.subscriptionStatus),
        maxInvoicesPerMonth: limits.maxInvoicesPerMonth,
        restrictedPages: limits.restrictedPages,
      },
      usage: {
        invoicesThisMonth: invoiceCount,
        activeUsers: userCount,
      },
    };
  }

  async subscribe(
    organizationId: string,
    planTier: 'STARTER' | 'PRO' | 'BUSINESS',
    billingPeriod: 'MONTHLY' | 'ANNUAL',
    email: string,
    paymentMethod: 'CARD' | 'BANK' = 'CARD',
  ) {
    const prices = PLAN_PRICES[planTier];
    if (!prices) {
      throw new BadRequestException('Invalid plan tier');
    }

    const maxUsers = PLAN_LIMITS[planTier].maxUsers;
    if (maxUsers !== Infinity) {
      const activeUsers = await this.prisma.user.count({
        where: { organizationId, isActive: true },
      });
      if (activeUsers > maxUsers) {
        throw new BadRequestException(
          `Your organization has ${activeUsers} active users, which exceeds the ${planTier} plan's limit of ${maxUsers}. Deactivate users or choose a higher plan.`,
        );
      }
    }

    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { isTestAccount: true } });
    const amount = planAmount(planTier, billingPeriod, !!org?.isTestAccount);
    if (org?.isTestAccount) this.logger.log(`Test account ${organizationId}: charging ${amount} naira for ${planTier} ${billingPeriod}`);
    const reference = `SUB-${organizationId.slice(0, 8)}-${Date.now()}`;

    const payByBank = paymentMethod === 'BANK';
    if (payByBank && !this.bankCheckoutEnabled && !org?.isTestAccount) {
      throw new BadRequestException('Paying from a bank account is not available yet. Please pay by card.');
    }
    if (payByBank && amount > this.directDebitMaxAmount) {
      throw new BadRequestException(
        `Paying from a bank account is available for payments up to ${this.directDebitMaxAmount.toLocaleString('en-NG')} naira (monthly plans). Please pay this one by card.`,
      );
    }

    const response = await fetch(`${this.paystackBaseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: amount * 100, // Convert to kobo
        reference,
        callback_url: `${this.callbackUrl}?type=subscription`,
        channels: payByBank ? ['bank'] : ['card'],
        metadata: {
          type: 'subscription',
          organization_id: organizationId,
          plan_tier: planTier,
          billing_period: billingPeriod,
          payment_method: payByBank ? 'BANK' : 'CARD',
        },
      }),
    });

    const data = await response.json();

    if (!data.status) {
      throw new BadRequestException(data.message || 'Failed to initialize payment');
    }

    if (payByBank) {
      // Paystack accepts the request but its checkout page can still refuse to open ("No active
      // channel") when bank payment isn't enabled for us. Ask the same question the page will, so
      // the customer gets a clear message here instead of a dead Paystack page.
      const check = await fetch(`${this.paystackBaseUrl}/transaction/verify_access_code/${encodeURIComponent(data.data.access_code)}`)
        .then((r) => r.json())
        .catch(() => null);
      if (check && check.status === false) {
        this.logger.warn(`Bank checkout refused by Paystack for org ${organizationId}: ${check.message ?? 'no message'} (reference ${data.data.reference})`);
        throw new BadRequestException('Paying from a bank account is not available right now. Please pay by card.');
      }
    }

    return {
      paymentUrl: data.data.authorization_url,
      reference: data.data.reference,
      accessCode: data.data.access_code,
    };
  }

  async activateSubscription(
    organizationId: string,
    planTier: string,
    billingPeriod: string,
    reference: string,
    amount: number,
    authorizationCode?: string,
    billingEmail?: string,
    cardType?: string,
    cardLast4?: string,
    // A renewal paid from a bank-account mandate must leave the saved card, its email and the
    // autoRenew flag alone — the card is the fallback if a later bank debit fails.
    opts: { keepPaymentMethod?: boolean } = {},
  ) {
    // Idempotent: skip if this reference was already processed, but patch auth code if it arrived late
    const existing = await this.prisma.subscriptionPayment.findUnique({
      where: { paystackReference: reference },
    });
    if (existing) {
      if (authorizationCode) {
        const org = await this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { paystackAuthorizationCode: true },
        });
        if (!org?.paystackAuthorizationCode) {
          await this.prisma.organization.update({
            where: { id: organizationId },
            data: {
              paystackAuthorizationCode: authorizationCode,
              ...(billingEmail && { paystackBillingEmail: billingEmail }),
              ...(cardType && { paystackCardType: cardType }),
              ...(cardLast4 && { paystackCardLast4: cardLast4 }),
            },
          });
          this.logger.log(`Patched missing auth code for org ${organizationId}`);
        }
      }
      this.logger.log(`Subscription payment ${reference} already processed, skipping`);
      return;
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (billingPeriod === 'ANNUAL') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.organization.update({
          where: { id: organizationId },
          data: {
            planTier: planTier as any,
            subscriptionStatus: 'ACTIVE',
            billingPeriod: billingPeriod as any,
            subscriptionStartDate: now,
            subscriptionEndDate: periodEnd,
            pendingRenewalReference: null,
            pendingRenewalStartedAt: null,
            ...(!opts.keepPaymentMethod && {
              autoRenew: !!authorizationCode,
              ...(authorizationCode && { paystackAuthorizationCode: authorizationCode }),
              ...(billingEmail && { paystackBillingEmail: billingEmail }),
              ...(cardType && { paystackCardType: cardType }),
              ...(cardLast4 && { paystackCardLast4: cardLast4 }),
            }),
          },
        });

        await tx.subscriptionPayment.create({
          data: {
            organizationId,
            amount,
            billingPeriod: billingPeriod as any,
            planTier: planTier as any,
            paystackReference: reference,
            paidAt: now,
            periodStart: now,
            periodEnd,
          },
        });
      });

      this.logger.log(`Subscription activated for org ${organizationId}: ${planTier} ${billingPeriod}`);

      // Dispatch subscription success email
      const admin = await this.getOrgAdmin(organizationId);
      if (admin) {
        await this.emailService
          .sendSubscriptionSuccessEmail(
            admin.email,
            admin.firstName,
            planTier,
            billingPeriod,
            amount,
            // Explicit locale: the server's default would print US-style 10/25/2026 to Nigerian owners.
            periodEnd.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }),
          )
          .catch((err) => this.logger.error(`Failed to send subscription success email: ${err.message}`));
      }
    } catch (error) {
      // Unique constraint on paystackReference — another process already activated this
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.log(`Subscription payment ${reference} race condition, already processed`);
        return;
      }
      throw error;
    }
  }

  // The org's billing contact: its owner (signup makes them SUPER_ADMIN), falling back to the
  // earliest ADMIN. This used to match ADMIN only — and almost no org has one, since signup
  // creates a SUPER_ADMIN — so trial, renewal and subscription emails silently went to nobody.
  // Placeholder-email (PIN-only) accounts have no real inbox and are never picked.
  private async getOrgAdmin(organizationId: string) {
    const admins = await this.prisma.user.findMany({
      where: { organizationId, isActive: true, hasPlaceholderEmail: false, roles: { hasSome: ['SUPER_ADMIN', 'ADMIN'] } },
      select: { email: true, firstName: true, roles: true, organization: { select: { posMode: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const admin = admins.find((u) => u.roles.includes('SUPER_ADMIN')) ?? admins[0];
    return admin ? { email: admin.email, firstName: admin.firstName, posMode: admin.organization.posMode } : null;
  }

  async renewSubscription(organizationId: string): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        planTier: true,
        billingPeriod: true,
        paystackAuthorizationCode: true,
        paystackBillingEmail: true,
        paystackCardType: true,
        paystackCardLast4: true,
        directDebitStatus: true,
        directDebitAuthorizationCode: true,
        directDebitEmail: true,
        pendingRenewalReference: true,
        isTestAccount: true,
      },
    });

    if (!org || !org.billingPeriod || org.planTier === 'FREE') return false;

    // A bank debit was already submitted and hasn't settled: never charge twice for one renewal.
    if (org.pendingRenewalReference) {
      this.logger.log(`Renewal for org ${organizationId} is still settling (${org.pendingRenewalReference}), not charging again`);
      return false;
    }

    const prices = PLAN_PRICES[org.planTier as keyof typeof PLAN_PRICES];
    if (!prices) return false;
    const amount = planAmount(org.planTier as keyof typeof PLAN_PRICES, org.billingPeriod, org.isTestAccount);

    const canDebitBank =
      org.directDebitStatus === 'ACTIVE' &&
      !!org.directDebitAuthorizationCode &&
      !!org.directDebitEmail &&
      amount <= this.directDebitMaxAmount;
    const canChargeCard = !!org.paystackAuthorizationCode && !!org.paystackBillingEmail;

    if (!canDebitBank && !canChargeCard) {
      this.logger.warn(`Auto-renewal skipped for org ${organizationId}: no usable payment method on file`);
      await this.notifyRenewalFailed(organizationId, org.planTier);
      return false;
    }

    if (canDebitBank) {
      const reference = `RENEW-${organizationId.slice(0, 8)}-${Date.now()}`;
      const result = await this.paystackService.chargeAuthorization(
        org.directDebitEmail!,
        amount * 100,
        org.directDebitAuthorizationCode!,
        reference,
        this.renewalMetadata(organizationId, org.planTier, org.billingPeriod),
      );

      if (result.success) {
        await this.activateSubscription(
          organizationId, org.planTier, org.billingPeriod, result.reference, amount,
          undefined, undefined, undefined, undefined, { keepPaymentMethod: true },
        );
        this.logger.log(`Auto-renewed subscription for org ${organizationId} from bank account`);
        return true;
      }

      if (result.pending) {
        // Settles later; the charge.success webhook (or the nightly follow-up) finishes it.
        await this.prisma.organization.update({
          where: { id: organizationId },
          data: { pendingRenewalReference: result.reference, pendingRenewalStartedAt: new Date() },
        });
        this.logger.log(`Bank debit for org ${organizationId} submitted and settling (${result.reference})`);
        return true;
      }

      this.logger.warn(`Bank debit failed for org ${organizationId}${canChargeCard ? ', trying the card' : ''}`);
    }

    if (canChargeCard) {
      return this.renewWithCard(organizationId, org);
    }

    await this.notifyRenewalFailed(organizationId, org.planTier);
    return false;
  }

  private renewalMetadata(organizationId: string, planTier: string, billingPeriod: string) {
    return {
      type: 'subscription',
      organization_id: organizationId,
      plan_tier: planTier,
      billing_period: billingPeriod,
    };
  }

  private async renewWithCard(
    organizationId: string,
    org: {
      planTier: string;
      billingPeriod: string | null;
      paystackAuthorizationCode: string | null;
      paystackBillingEmail: string | null;
      paystackCardType: string | null;
      paystackCardLast4: string | null;
      isTestAccount?: boolean;
    },
  ): Promise<boolean> {
    const prices = PLAN_PRICES[org.planTier as keyof typeof PLAN_PRICES];
    if (!prices || !org.billingPeriod || !org.paystackAuthorizationCode || !org.paystackBillingEmail) return false;

    const amount = planAmount(org.planTier as keyof typeof PLAN_PRICES, org.billingPeriod, !!org.isTestAccount);
    const reference = `RENEW-${organizationId.slice(0, 8)}-${Date.now()}`;

    const result = await this.paystackService.chargeAuthorization(
      org.paystackBillingEmail,
      amount * 100,
      org.paystackAuthorizationCode,
      reference,
      this.renewalMetadata(organizationId, org.planTier, org.billingPeriod),
    );

    if (!result.success) {
      this.logger.warn(`Auto-renewal failed for org ${organizationId}`);
      await this.notifyRenewalFailed(organizationId, org.planTier);
      return false;
    }

    await this.activateSubscription(
      organizationId,
      org.planTier,
      org.billingPeriod,
      result.reference,
      amount,
      org.paystackAuthorizationCode,
      org.paystackBillingEmail,
      org.paystackCardType ?? undefined,
      org.paystackCardLast4 ?? undefined,
    );

    this.logger.log(`Auto-renewed subscription for org ${organizationId}`);
    return true;
  }

  private async notifyRenewalFailed(organizationId: string, planTier: string) {
    const admin = await this.getOrgAdmin(organizationId);
    if (!admin) return;
    this.emailService
      .sendRenewalFailedEmail(admin.email, admin.firstName, planTier, admin.posMode)
      .catch((err) => this.logger.error(`Failed to send renewal failed email: ${err.message}`));
  }

  /**
   * How long a bank debit may stay unresolved before it is treated as failed. This is also the
   * grace a customer gets after paying their first plan by bank: access is on straight away and
   * lapses if the debit hasn't gone through within this time.
   */
  private static readonly BANK_DEBIT_GRACE_HOURS = 24;
  private static readonly BANK_DEBIT_GRACE_MS = SubscriptionService.BANK_DEBIT_GRACE_HOURS * 60 * 60 * 1000;

  /**
   * Follows up bank debits that were submitted but hadn't settled. Paystack only webhooks
   * successes, so a failed debit is only discovered by asking. A debit that failed or has been
   * stuck too long falls back to the card, or tells the admin.
   */
  async reconcilePendingRenewals() {
    const pending = await this.prisma.organization.findMany({
      where: { pendingRenewalReference: { not: null } },
      select: {
        id: true,
        planTier: true,
        billingPeriod: true,
        pendingRenewalReference: true,
        pendingRenewalStartedAt: true,
        paystackAuthorizationCode: true,
        paystackBillingEmail: true,
        paystackCardType: true,
        paystackCardLast4: true,
        isTestAccount: true,
      },
    });

    for (const org of pending) {
      try {
        const reference = org.pendingRenewalReference!;
        const status = await this.paystackService.getTransactionStatus(reference);
        if (!status) continue; // Paystack unreachable — try again tomorrow

        if (status.status === 'success') {
          await this.activateSubscription(
            org.id, org.planTier, org.billingPeriod!, reference, status.amount / 100,
            undefined, undefined, undefined, undefined, { keepPaymentMethod: true },
          );
          continue;
        }

        const ageMs = Date.now() - (org.pendingRenewalStartedAt?.getTime() ?? 0);
        const tooOld = ageMs > SubscriptionService.BANK_DEBIT_GRACE_MS;
        const failed = ['failed', 'reversed', 'abandoned'].includes(status.status);
        if (!failed && !tooOld) continue; // still settling

        await this.prisma.organization.update({
          where: { id: org.id },
          data: { pendingRenewalReference: null, pendingRenewalStartedAt: null },
        });
        this.logger.warn(`Bank debit ${reference} for org ${org.id} ${failed ? `failed (${status.gatewayResponse ?? status.status})` : 'never settled'}`);

        if (org.paystackAuthorizationCode && org.paystackBillingEmail) {
          await this.renewWithCard(org.id, org);
        } else {
          await this.notifyRenewalFailed(org.id, org.planTier);
        }
      } catch (err) {
        this.logger.error(`Failed to reconcile pending renewal for org ${org.id}: ${err.message}`);
      }
    }
  }

  // ── Bank-account (Direct Debit) renewals ────────────────────────────────────

  getDirectDebitBanks() {
    return this.paystackService.listDirectDebitBanks();
  }

  /**
   * Starts a bank-account mandate for renewals. No money moves: the admin links an account on
   * Paystack's page and the mandate arrives later by webhook. The mandate is tied to the email
   * used here, which Paystack requires again on every charge.
   */
  async setupDirectDebit(organizationId: string, email: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { subscriptionStatus: true, isGrandfathered: true, directDebitStatus: true },
    });
    if (!org) throw new BadRequestException('Organization not found');
    if (org.isGrandfathered || org.subscriptionStatus !== 'ACTIVE') {
      throw new BadRequestException('Subscribe to a plan first, then you can use a bank account for renewals.');
    }
    if (org.directDebitStatus === 'ACTIVE') {
      throw new BadRequestException('A bank account is already linked. Remove it before linking another.');
    }

    const { redirectUrl, reference } = await this.paystackService.initializeDirectDebitAuthorization(
      email,
      `${this.callbackUrl}?type=direct_debit`,
    );

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        directDebitStatus: 'PENDING',
        directDebitReference: reference,
        directDebitEmail: email,
        directDebitAuthorizationCode: null,
        directDebitBankName: null,
        directDebitAccountLast4: null,
      },
    });

    return { paymentUrl: redirectUrl, reference };
  }

  async removeDirectDebit(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { directDebitAuthorizationCode: true },
    });
    if (org?.directDebitAuthorizationCode) {
      await this.paystackService.deactivateAuthorization(org.directDebitAuthorizationCode);
    }
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        directDebitStatus: null,
        directDebitAuthorizationCode: null,
        directDebitEmail: null,
        directDebitBankName: null,
        directDebitAccountLast4: null,
        directDebitReference: null,
      },
    });
    return { message: 'Bank account removed. Renewals will use your card.' };
  }

  /**
   * Handles Paystack's direct_debit.authorization.* webhooks. Only ".active" makes a mandate
   * chargeable. The payload is matched to an org by the reference we got when starting the
   * mandate, falling back to the customer email we started it with.
   */
  async handleDirectDebitEvent(event: string, data: any) {
    const auth = data?.authorization ?? data ?? {};
    const code: string | undefined = auth.authorization_code ?? data?.authorization_code;
    const email: string | undefined = data?.customer?.email ?? data?.email ?? auth.email;
    const reference: string | undefined = data?.reference ?? auth.reference;

    const matchers: Prisma.OrganizationWhereInput[] = [];
    if (reference) matchers.push({ directDebitReference: reference });
    if (email) matchers.push({ directDebitEmail: email, directDebitStatus: { in: ['PENDING', 'ACTIVE'] } });
    const org = matchers.length
      ? await this.prisma.organization.findFirst({ where: { OR: matchers }, select: { id: true, directDebitEmail: true } })
      : null;

    if (!org) {
      this.logger.warn(`Direct debit event ${event} matched no organization (reference=${reference ?? '-'}, email=${email ?? '-'})`);
      return;
    }

    if (event === 'direct_debit.authorization.created') {
      await this.prisma.organization.update({ where: { id: org.id }, data: { directDebitStatus: 'PENDING' } });
      return;
    }

    if (event === 'direct_debit.authorization.active') {
      if (!code) {
        this.logger.error(`direct_debit.authorization.active for org ${org.id} carried no authorization code; keys=${Object.keys(auth).join(',')}`);
        return;
      }
      const bank = typeof auth.bank === 'string' ? auth.bank : auth.bank?.name ?? auth.bank_name ?? null;
      const accountNumber: string | undefined = auth.account_number ?? auth.last4;
      await this.prisma.organization.update({
        where: { id: org.id },
        data: {
          directDebitStatus: 'ACTIVE',
          // Linking a bank account is an explicit choice to renew from it, even if the last payment saved no card.
          autoRenew: true,
          directDebitAuthorizationCode: code,
          directDebitEmail: email ?? org.directDebitEmail,
          directDebitBankName: bank,
          directDebitAccountLast4: accountNumber ? String(accountNumber).slice(-4) : null,
        },
      });
      this.logger.log(`Direct debit mandate active for org ${org.id}`);
      return;
    }

    if (/revoked|deactivated|cancel/i.test(event)) {
      await this.prisma.organization.update({ where: { id: org.id }, data: { directDebitStatus: 'REVOKED' } });
      return;
    }

    this.logger.log(`Unhandled direct debit event ${event} for org ${org.id}; keys=${Object.keys(data ?? {}).join(',')}`);
  }

  async verifyAndActivatePayment(organizationId: string, reference: string) {
    // Verify payment with Paystack
    const response = await fetch(`${this.paystackBaseUrl}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${this.paystackSecretKey}`,
      },
    });

    const result = await response.json();
    const status = result.data?.status;
    const paid = !!result.status && status === 'success';
    // A bank payment may not be settled when the customer returns from checkout (Paystack
    // "processing"). That is not a failure — see grantBankPaymentGrace.
    const processing = !!result.status && status === 'processing';

    if (!paid && !processing) {
      throw new BadRequestException('Payment verification failed');
    }

    const { metadata, amount, authorization, customer } = result.data;

    if (metadata?.type !== 'subscription') {
      throw new BadRequestException('This is not a subscription payment');
    }

    if (metadata.organization_id !== organizationId) {
      throw new BadRequestException('Payment does not belong to this organization');
    }

    if (processing) {
      if (metadata.payment_method !== 'BANK') {
        throw new BadRequestException('Payment verification failed');
      }
      await this.grantBankPaymentGrace(organizationId, metadata.plan_tier, metadata.billing_period, reference);
      return {
        activated: false,
        pending: true,
        planTier: metadata.plan_tier,
        billingPeriod: metadata.billing_period,
        graceHours: SubscriptionService.BANK_DEBIT_GRACE_HOURS,
      };
    }

    const isBankDebit = authorization?.channel === 'direct_debit' || authorization?.card_type === 'mandate';
    await this.activateSubscription(
      organizationId,
      metadata.plan_tier,
      metadata.billing_period,
      reference,
      amount / 100, // kobo → naira
      isBankDebit ? undefined : authorization?.reusable ? authorization.authorization_code : undefined,
      isBankDebit ? undefined : customer?.email,
      isBankDebit ? undefined : authorization?.card_type,
      isBankDebit ? undefined : authorization?.last4,
      { keepPaymentMethod: isBankDebit },
    );
    if (isBankDebit) await this.saveBankMandateFromCharge(organizationId, authorization, customer?.email);

    return { activated: true, planTier: metadata.plan_tier, billingPeriod: metadata.billing_period };
  }

  /**
   * First payment by bank account came back "processing". Switch the plan on now with a short
   * grace so the customer isn't locked out while the bank settles: if the debit confirms, the
   * charge.success webhook (or the nightly follow-up) gives them the full period; if it fails or
   * hasn't settled when the grace ends, the plan lapses like any unpaid one.
   */
  async grantBankPaymentGrace(organizationId: string, planTier: string, billingPeriod: string, reference: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { pendingRenewalReference: true, subscriptionEndDate: true, subscriptionStatus: true },
    });
    if (!org) throw new BadRequestException('Organization not found');
    if (org.pendingRenewalReference === reference) return; // already granted (page refreshed, webhook raced)

    const now = new Date();
    const graceEnd = new Date(now.getTime() + SubscriptionService.BANK_DEBIT_GRACE_MS);
    // Upgrading mid-period must not cut short time already paid for.
    const keepExistingEnd =
      org.subscriptionStatus === 'ACTIVE' && org.subscriptionEndDate && org.subscriptionEndDate > graceEnd;

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        planTier: planTier as any,
        subscriptionStatus: 'ACTIVE',
        billingPeriod: billingPeriod as any,
        subscriptionStartDate: now,
        subscriptionEndDate: keepExistingEnd ? org.subscriptionEndDate : graceEnd,
        pendingRenewalReference: reference,
        pendingRenewalStartedAt: now,
      },
    });
    this.logger.log(`Bank payment ${reference} for org ${organizationId} is processing; ${planTier} ${billingPeriod} active for ${SubscriptionService.BANK_DEBIT_GRACE_HOURS}h grace`);
  }

  /**
   * A bank debit that succeeded proves the mandate works, so keep its authorization for renewals
   * even if the separate mandate-active webhook is late or shaped differently than expected.
   */
  async saveBankMandateFromCharge(
    organizationId: string,
    authorization: { authorization_code?: string; reusable?: boolean; bank?: string; last4?: string } | undefined,
    email?: string,
  ) {
    if (!authorization?.authorization_code || authorization.reusable === false) return;
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        directDebitStatus: 'ACTIVE',
        directDebitAuthorizationCode: authorization.authorization_code,
        ...(email && { directDebitEmail: email }),
        ...(authorization.bank && { directDebitBankName: authorization.bank }),
        ...(authorization.last4 && { directDebitAccountLast4: authorization.last4 }),
      },
    });
  }

  async cancelSubscription(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { subscriptionStatus: true },
    });

    if (!org || org.subscriptionStatus !== 'ACTIVE') {
      throw new BadRequestException('No active subscription to cancel');
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { subscriptionStatus: 'CANCELLED' },
    });

    return { message: 'Subscription cancelled. Access continues until the end of your billing period.' };
  }

  async checkAndExpireTrials() {
    const now = new Date();
    const expiringOrgs = await this.prisma.organization.findMany({
      where: {
        subscriptionStatus: 'TRIALING',
        trialEndDate: { lt: now },
        isGrandfathered: false,
      },
      select: { id: true },
    });

    if (expiringOrgs.length === 0) return;

    const orgIds = expiringOrgs.map((o) => o.id);

    await this.prisma.organization.updateMany({
      where: { id: { in: orgIds } },
      data: {
        planTier: 'FREE',
        subscriptionStatus: 'EXPIRED',
      },
    });

    this.logger.log(`Expired ${orgIds.length} trial(s)`);

    for (const orgId of orgIds) {
      try {
        const admin = await this.getOrgAdmin(orgId);
        if (admin) {
          await this.emailService.sendTrialExpiredEmail(admin.email, admin.firstName, admin.posMode);
        }
      } catch (error) {
        this.logger.error(`Failed to send trial expired email for org ${orgId}: ${error.message}`);
      }
    }
  }

  async sendTrialWarnings() {
    const now = new Date();
    const targetDateMin = new Date(now);
    targetDateMin.setDate(targetDateMin.getDate() + 4);
    const targetDateMax = new Date(now);
    targetDateMax.setDate(targetDateMax.getDate() + 5);

    const warningOrgs = await this.prisma.organization.findMany({
      where: {
        subscriptionStatus: 'TRIALING',
        trialEndDate: {
          gte: targetDateMin,
          lt: targetDateMax,
        },
        isGrandfathered: false,
      },
      select: { id: true },
    });

    for (const org of warningOrgs) {
      try {
        const admin = await this.getOrgAdmin(org.id);
        if (admin) {
          await this.emailService.sendTrialEndingWarningEmail(admin.email, admin.firstName, 5, admin.posMode);
        }
      } catch (error) {
        this.logger.error(`Failed to send trial warning email for org ${org.id}: ${error.message}`);
      }
    }
  }

  async checkAndExpireSubscriptions() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Settle bank debits submitted on earlier nights before deciding who has lapsed.
    await this.reconcilePendingRenewals();

    // Attempt auto-renewal for ACTIVE subscriptions expiring in the next 24 hours
    const renewableOrgs = await this.prisma.organization.findMany({
      where: {
        subscriptionStatus: 'ACTIVE',
        subscriptionEndDate: { gte: now, lt: tomorrow },
        autoRenew: true,
        // A saved card, or a bank mandate that is active (a bank-only org has no card).
        OR: [{ paystackAuthorizationCode: { not: null } }, { directDebitStatus: 'ACTIVE' }],
        isGrandfathered: false,
      },
      select: { id: true },
    });

    for (const org of renewableOrgs) {
      // One org's renewal failure (e.g. a transient DB error inside activateSubscription) must
      // not abort the loop and skip renewal/expiry processing for every other org that night.
      try {
        await this.renewSubscription(org.id);
      } catch (err) {
        this.logger.error(`Failed to renew subscription for org ${org.id}: ${err.message}`);
      }
    }

    // Expire anything that is past its end date and wasn't (or couldn't be) renewed
    const result = await this.prisma.organization.updateMany({
      where: {
        subscriptionStatus: { in: ['CANCELLED', 'ACTIVE'] },
        subscriptionEndDate: { lt: now },
        isGrandfathered: false,
        // A bank debit that is still settling gets its grace period before the plan is treated as lapsed.
        OR: [
          { pendingRenewalReference: null },
          { pendingRenewalStartedAt: { lt: new Date(now.getTime() - SubscriptionService.BANK_DEBIT_GRACE_MS) } },
        ],
      },
      data: {
        planTier: 'FREE',
        subscriptionStatus: 'EXPIRED',
      },
    });

    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} subscription(s)`);
    }
  }

  async toggleAutoRenew(organizationId: string, enabled: boolean) {
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: { autoRenew: enabled },
    });
  }

  async getPaymentHistory(organizationId: string) {
    return this.prisma.subscriptionPayment.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
