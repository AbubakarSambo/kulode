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
import { PLAN_LIMITS, PLAN_PRICES } from '../../common/plan-limits';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private readonly paystackSecretKey: string;
  private readonly paystackBaseUrl: string;
  private readonly callbackUrl: string;

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
      limits: {
        maxUsers: limits.maxUsers,
        maxInvoicesPerMonth: limits.maxInvoicesPerMonth,
        restrictedPages: limits.restrictedPages,
      },
      usage: {
        invoicesThisMonth: invoiceCount,
        activeUsers: userCount,
      },
    };
  }

  async subscribe(organizationId: string, planTier: 'STARTER' | 'PRO' | 'BUSINESS', billingPeriod: 'MONTHLY' | 'ANNUAL', email: string) {
    const prices = PLAN_PRICES[planTier];
    if (!prices) {
      throw new BadRequestException('Invalid plan tier');
    }

    const amount = billingPeriod === 'MONTHLY' ? prices.monthly : prices.annual;
    const reference = `SUB-${organizationId.slice(0, 8)}-${Date.now()}`;

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
        channels: ['card'],
        metadata: {
          type: 'subscription',
          organization_id: organizationId,
          plan_tier: planTier,
          billing_period: billingPeriod,
        },
      }),
    });

    const data = await response.json();

    if (!data.status) {
      throw new BadRequestException(data.message || 'Failed to initialize payment');
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
            autoRenew: !!authorizationCode,
            ...(authorizationCode && { paystackAuthorizationCode: authorizationCode }),
            ...(billingEmail && { paystackBillingEmail: billingEmail }),
            ...(cardType && { paystackCardType: cardType }),
            ...(cardLast4 && { paystackCardLast4: cardLast4 }),
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
            periodEnd.toLocaleDateString(),
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

  private async getOrgAdmin(organizationId: string) {
    return this.prisma.user.findFirst({
      where: { organizationId, role: 'ADMIN', isActive: true },
      select: { email: true, firstName: true },
    });
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
      },
    });

    if (
      !org ||
      !org.paystackAuthorizationCode ||
      !org.paystackBillingEmail ||
      !org.billingPeriod ||
      org.planTier === 'FREE'
    ) {
      if (org && org.planTier !== 'FREE' && org.billingPeriod && !org.paystackAuthorizationCode) {
        const admin = await this.getOrgAdmin(organizationId);
        if (admin) {
          this.emailService
            .sendRenewalFailedEmail(admin.email, admin.firstName, org.planTier)
            .catch((err) => this.logger.error(`Failed to send renewal failed email: ${err.message}`));
        }
        this.logger.warn(`Auto-renewal skipped for org ${organizationId}: no payment method on file`);
      }
      return false;
    }

    const prices = PLAN_PRICES[org.planTier as keyof typeof PLAN_PRICES];
    if (!prices) return false;

    const amount = org.billingPeriod === 'ANNUAL' ? prices.annual : prices.monthly;
    const reference = `RENEW-${organizationId.slice(0, 8)}-${Date.now()}`;

    const result = await this.paystackService.chargeAuthorization(
      org.paystackBillingEmail,
      amount * 100,
      org.paystackAuthorizationCode,
      reference,
      {
        type: 'subscription',
        organization_id: organizationId,
        plan_tier: org.planTier,
        billing_period: org.billingPeriod,
      },
    );

    if (!result.success) {
      this.logger.warn(`Auto-renewal failed for org ${organizationId}`);
      const admin = await this.getOrgAdmin(organizationId);
      if (admin) {
        this.emailService
          .sendRenewalFailedEmail(admin.email, admin.firstName, org.planTier)
          .catch((err) => this.logger.error(`Failed to send renewal failed email: ${err.message}`));
      }
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

  async verifyAndActivatePayment(organizationId: string, reference: string) {
    // Verify payment with Paystack
    const response = await fetch(`${this.paystackBaseUrl}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${this.paystackSecretKey}`,
      },
    });

    const result = await response.json();

    if (!result.status || result.data?.status !== 'success') {
      throw new BadRequestException('Payment verification failed');
    }

    const { metadata, amount, authorization, customer } = result.data;

    if (metadata?.type !== 'subscription') {
      throw new BadRequestException('This is not a subscription payment');
    }

    if (metadata.organization_id !== organizationId) {
      throw new BadRequestException('Payment does not belong to this organization');
    }

    await this.activateSubscription(
      organizationId,
      metadata.plan_tier,
      metadata.billing_period,
      reference,
      amount / 100, // kobo → naira
      authorization?.reusable ? authorization.authorization_code : undefined,
      customer?.email,
      authorization?.card_type,
      authorization?.last4,
    );

    return { activated: true, planTier: metadata.plan_tier, billingPeriod: metadata.billing_period };
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
          await this.emailService.sendTrialExpiredEmail(admin.email, admin.firstName);
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
          await this.emailService.sendTrialEndingWarningEmail(admin.email, admin.firstName, 5);
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

    // Attempt auto-renewal for ACTIVE subscriptions expiring in the next 24 hours
    const renewableOrgs = await this.prisma.organization.findMany({
      where: {
        subscriptionStatus: 'ACTIVE',
        subscriptionEndDate: { gte: now, lt: tomorrow },
        autoRenew: true,
        paystackAuthorizationCode: { not: null },
        isGrandfathered: false,
      },
      select: { id: true },
    });

    for (const org of renewableOrgs) {
      await this.renewSubscription(org.id);
    }

    // Expire anything that is past its end date and wasn't (or couldn't be) renewed
    const result = await this.prisma.organization.updateMany({
      where: {
        subscriptionStatus: { in: ['CANCELLED', 'ACTIVE'] },
        subscriptionEndDate: { lt: now },
        isGrandfathered: false,
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
