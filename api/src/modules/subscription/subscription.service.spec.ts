import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SubscriptionService } from './subscription.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

import { PaystackService } from '../paystack/paystack.service';
import { EmailService } from '../email/email.service';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

function createMockPrisma() {
  return {
    organization: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    invoice: {
      count: jest.fn(),
    },
    user: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    subscriptionPayment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

function createMockConfig() {
  return {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'paystack.secretKey': 'sk_test_xxx',
        'paystack.baseUrl': 'https://api.paystack.co',
        'paystack.callbackUrl': 'http://localhost:5173/payment/callback',
      };
      return values[key];
    }),
  };
}

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let configService: ReturnType<typeof createMockConfig>;
  let paystackService: PaystackService;
  let emailService: EmailService;

  const ORG_ID = 'org-12345678-abcd';

  beforeEach(async () => {
    prisma = createMockPrisma();
    configService = createMockConfig();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        {
          provide: PaystackService,
          useValue: {
            chargeAuthorization: jest.fn(),
            getTransactionStatus: jest.fn(),
            initializeDirectDebitAuthorization: jest.fn(),
            listDirectDebitBanks: jest.fn(),
            deactivateAuthorization: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendRenewalFailedEmail: jest.fn().mockResolvedValue({}),
            sendTrialEndingWarningEmail: jest.fn().mockResolvedValue({}),
            sendTrialExpiredEmail: jest.fn().mockResolvedValue({}),
            sendSubscriptionSuccessEmail: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
    paystackService = module.get<PaystackService>(PaystackService);
    emailService = module.get<EmailService>(EmailService);
    jest.clearAllMocks();
  });

  // ─── getCurrentPlan ───────────────────────────────────────────────

  describe('getCurrentPlan', () => {
    it('should throw if organization not found', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.getCurrentPlan(ORG_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return PRO plan for active trialing org with days remaining', async () => {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 15); // 15 days remaining

      prisma.organization.findUnique.mockResolvedValue({
        planTier: 'PRO',
        subscriptionStatus: 'TRIALING',
        billingPeriod: null,
        trialStartDate: new Date(),
        trialEndDate: trialEnd,
        subscriptionStartDate: null,
        subscriptionEndDate: null,
        isGrandfathered: false,
      });
      prisma.invoice.count.mockResolvedValue(5);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.getCurrentPlan(ORG_ID);

      expect(result.effectivePlan).toBe('PRO');
      expect(result.planTier).toBe('PRO');
      expect(result.subscriptionStatus).toBe('TRIALING');
      expect(result.trialDaysRemaining).toBeGreaterThan(0);
      expect(result.trialDaysRemaining).toBeLessThanOrEqual(15);
      // Unlimited users while the trial is live; PRO's cap of 20 applies once subscribed.
      expect(result.limits.maxUsers).toBe(Infinity);
      expect(result.limits.maxInvoicesPerMonth).toBe(100);
    });

    it('should downgrade effective plan to FREE when trial has expired', async () => {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() - 1); // expired yesterday

      prisma.organization.findUnique.mockResolvedValue({
        planTier: 'PRO',
        subscriptionStatus: 'TRIALING',
        billingPeriod: null,
        trialStartDate: new Date(),
        trialEndDate: trialEnd,
        subscriptionStartDate: null,
        subscriptionEndDate: null,
        isGrandfathered: false,
      });
      prisma.invoice.count.mockResolvedValue(0);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.getCurrentPlan(ORG_ID);

      expect(result.effectivePlan).toBe('FREE');
      expect(result.planTier).toBe('PRO'); // stored plan unchanged
      expect(result.trialDaysRemaining).toBe(0);
      expect(result.limits.maxUsers).toBe(1);
      expect(result.limits.maxInvoicesPerMonth).toBe(5);
    });

    it('should downgrade effective plan to FREE when subscription status is EXPIRED', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        planTier: 'BUSINESS',
        subscriptionStatus: 'EXPIRED',
        billingPeriod: 'MONTHLY',
        trialStartDate: null,
        trialEndDate: null,
        subscriptionStartDate: new Date('2025-01-01'),
        subscriptionEndDate: new Date('2025-02-01'),
        isGrandfathered: false,
      });
      prisma.invoice.count.mockResolvedValue(0);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.getCurrentPlan(ORG_ID);

      expect(result.effectivePlan).toBe('FREE');
      expect(result.planTier).toBe('BUSINESS');
    });

    it('should downgrade to FREE when subscription is CANCELLED and end date passed', async () => {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - 5); // ended 5 days ago

      prisma.organization.findUnique.mockResolvedValue({
        planTier: 'PRO',
        subscriptionStatus: 'CANCELLED',
        billingPeriod: 'MONTHLY',
        trialStartDate: null,
        trialEndDate: null,
        subscriptionStartDate: new Date('2025-01-01'),
        subscriptionEndDate: endDate,
        isGrandfathered: false,
      });
      prisma.invoice.count.mockResolvedValue(0);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.getCurrentPlan(ORG_ID);

      expect(result.effectivePlan).toBe('FREE');
    });

    it('should keep effective plan when CANCELLED but end date is in the future', async () => {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 10); // 10 more days

      prisma.organization.findUnique.mockResolvedValue({
        planTier: 'PRO',
        subscriptionStatus: 'CANCELLED',
        billingPeriod: 'MONTHLY',
        trialStartDate: null,
        trialEndDate: null,
        subscriptionStartDate: new Date('2025-01-01'),
        subscriptionEndDate: endDate,
        isGrandfathered: false,
      });
      prisma.invoice.count.mockResolvedValue(0);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.getCurrentPlan(ORG_ID);

      expect(result.effectivePlan).toBe('PRO');
    });

    it('should return ACTIVE subscription with correct limits for BUSINESS', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        planTier: 'BUSINESS',
        subscriptionStatus: 'ACTIVE',
        billingPeriod: 'ANNUAL',
        trialStartDate: null,
        trialEndDate: null,
        subscriptionStartDate: new Date(),
        subscriptionEndDate: new Date('2027-01-01'),
        isGrandfathered: false,
      });
      prisma.invoice.count.mockResolvedValue(200);
      prisma.user.count.mockResolvedValue(10);

      const result = await service.getCurrentPlan(ORG_ID);

      expect(result.effectivePlan).toBe('BUSINESS');
      expect(result.limits.maxUsers).toBe(Infinity);
      expect(result.limits.maxInvoicesPerMonth).toBe(Infinity);
      expect(result.usage.invoicesThisMonth).toBe(200);
      expect(result.usage.activeUsers).toBe(10);
    });

    it('should return grandfathered status', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        planTier: 'PRO',
        subscriptionStatus: 'ACTIVE',
        billingPeriod: null,
        trialStartDate: null,
        trialEndDate: null,
        subscriptionStartDate: null,
        subscriptionEndDate: null,
        isGrandfathered: true,
      });
      prisma.invoice.count.mockResolvedValue(0);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.getCurrentPlan(ORG_ID);

      expect(result.isGrandfathered).toBe(true);
      expect(result.effectivePlan).toBe('PRO');
    });
  });

  // ─── subscribe ────────────────────────────────────────────────────

  describe('subscribe', () => {
    it('should initialize Paystack payment for PRO monthly', async () => {
      mockFetch.mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: true,
            data: {
              authorization_url: 'https://paystack.com/pay/abc',
              reference: 'SUB-org-1234-12345',
              access_code: 'access123',
            },
          }),
      });

      const result = await service.subscribe(ORG_ID, 'PRO', 'MONTHLY', 'user@test.com');

      expect(result.paymentUrl).toBe('https://paystack.com/pay/abc');
      expect(result.reference).toBe('SUB-org-1234-12345');
      expect(result.accessCode).toBe('access123');

      // Verify the correct amount was sent (50000 * 100 = 5000000 kobo)
      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.amount).toBe(5000000);
      expect(body.email).toBe('user@test.com');
      expect(body.metadata.type).toBe('subscription');
      expect(body.metadata.plan_tier).toBe('PRO');
      expect(body.metadata.billing_period).toBe('MONTHLY');
    });

    it('should initialize Paystack payment for BUSINESS annual', async () => {
      mockFetch.mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: true,
            data: {
              authorization_url: 'https://paystack.com/pay/xyz',
              reference: 'SUB-org-1234-99999',
              access_code: 'access456',
            },
          }),
      });

      const result = await service.subscribe(ORG_ID, 'BUSINESS', 'ANNUAL', 'admin@test.com');

      expect(result.paymentUrl).toBe('https://paystack.com/pay/xyz');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.amount).toBe(60000000); // 600000 * 100 kobo
    });

    it('should throw if Paystack initialization fails', async () => {
      mockFetch.mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: false,
            message: 'Invalid key',
          }),
      });

      await expect(
        service.subscribe(ORG_ID, 'PRO', 'MONTHLY', 'user@test.com'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── activateSubscription ─────────────────────────────────────────

  describe('activateSubscription', () => {
    it('should activate a monthly subscription', async () => {
      prisma.subscriptionPayment.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (fn: any) => {
        await fn({
          organization: { update: jest.fn() },
          subscriptionPayment: { create: jest.fn() },
        });
      });

      await service.activateSubscription(ORG_ID, 'PRO', 'MONTHLY', 'REF-123', 9900);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should set subscription end date 1 year ahead for annual billing', async () => {
      prisma.subscriptionPayment.findUnique.mockResolvedValue(null);

      let capturedOrgUpdate: any;
      let capturedPayment: any;
      prisma.$transaction.mockImplementation(async (fn: any) => {
        await fn({
          organization: {
            update: jest.fn().mockImplementation((args: any) => {
              capturedOrgUpdate = args;
            }),
          },
          subscriptionPayment: {
            create: jest.fn().mockImplementation((args: any) => {
              capturedPayment = args;
            }),
          },
        });
      });

      await service.activateSubscription(ORG_ID, 'BUSINESS', 'ANNUAL', 'REF-456', 400000);

      const endDate = capturedOrgUpdate.data.subscriptionEndDate;
      const startDate = capturedOrgUpdate.data.subscriptionStartDate;
      const diffMs = endDate.getTime() - startDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThanOrEqual(364); // ~1 year
      expect(diffDays).toBeLessThanOrEqual(366);

      expect(capturedOrgUpdate.data.planTier).toBe('BUSINESS');
      expect(capturedOrgUpdate.data.subscriptionStatus).toBe('ACTIVE');
      expect(capturedOrgUpdate.data.billingPeriod).toBe('ANNUAL');
    });

    it('should skip activation if reference already processed (idempotent)', async () => {
      prisma.subscriptionPayment.findUnique.mockResolvedValue({
        id: 'existing-payment',
        paystackReference: 'REF-DUP',
      });

      await service.activateSubscription(ORG_ID, 'PRO', 'MONTHLY', 'REF-DUP', 9900);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should handle P2002 race condition gracefully', async () => {
      prisma.subscriptionPayment.findUnique.mockResolvedValue(null);

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      prisma.$transaction.mockRejectedValue(p2002Error);

      // Should not throw
      await expect(
        service.activateSubscription(ORG_ID, 'PRO', 'MONTHLY', 'REF-RACE', 9900),
      ).resolves.toBeUndefined();
    });

    it('should rethrow non-P2002 errors', async () => {
      prisma.subscriptionPayment.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValue(new Error('Database connection lost'));

      await expect(
        service.activateSubscription(ORG_ID, 'PRO', 'MONTHLY', 'REF-ERR', 9900),
      ).rejects.toThrow('Database connection lost');
    });
  });

  // ─── verifyAndActivatePayment ─────────────────────────────────────

  describe('verifyAndActivatePayment', () => {
    it('should verify payment and activate subscription', async () => {
      mockFetch.mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: true,
            data: {
              status: 'success',
              amount: 990000, // kobo
              metadata: {
                type: 'subscription',
                organization_id: ORG_ID,
                plan_tier: 'PRO',
                billing_period: 'MONTHLY',
              },
            },
          }),
      });

      // Mock activateSubscription internals
      prisma.subscriptionPayment.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (fn: any) => {
        await fn({
          organization: { update: jest.fn() },
          subscriptionPayment: { create: jest.fn() },
        });
      });

      const result = await service.verifyAndActivatePayment(ORG_ID, 'REF-VERIFY');

      expect(result).toEqual({
        activated: true,
        planTier: 'PRO',
        billingPeriod: 'MONTHLY',
      });

      // Verify Paystack API was called
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/transaction/verify/REF-VERIFY'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer sk_test_xxx' },
        }),
      );
    });

    it('should throw if Paystack verification fails', async () => {
      mockFetch.mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: false,
            data: { status: 'failed' },
          }),
      });

      await expect(
        service.verifyAndActivatePayment(ORG_ID, 'REF-BAD'),
      ).rejects.toThrow('Payment verification failed');
    });

    it('should throw if payment is not a subscription type', async () => {
      mockFetch.mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: true,
            data: {
              status: 'success',
              amount: 50000,
              metadata: {
                type: 'invoice_payment',
                organization_id: ORG_ID,
              },
            },
          }),
      });

      await expect(
        service.verifyAndActivatePayment(ORG_ID, 'REF-INVOICE'),
      ).rejects.toThrow('This is not a subscription payment');
    });

    it('should throw if payment belongs to a different organization', async () => {
      mockFetch.mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: true,
            data: {
              status: 'success',
              amount: 990000,
              metadata: {
                type: 'subscription',
                organization_id: 'different-org-id',
                plan_tier: 'PRO',
                billing_period: 'MONTHLY',
              },
            },
          }),
      });

      await expect(
        service.verifyAndActivatePayment(ORG_ID, 'REF-WRONG-ORG'),
      ).rejects.toThrow('Payment does not belong to this organization');
    });
  });

  // ─── cancelSubscription ───────────────────────────────────────────

  describe('cancelSubscription', () => {
    it('should cancel an active subscription', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionStatus: 'ACTIVE',
      });
      prisma.organization.update.mockResolvedValue({});

      const result = await service.cancelSubscription(ORG_ID);

      expect(result.message).toContain('cancelled');
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        data: { subscriptionStatus: 'CANCELLED' },
      });
    });

    it('should throw if no active subscription', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionStatus: 'TRIALING',
      });

      await expect(service.cancelSubscription(ORG_ID)).rejects.toThrow(
        'No active subscription to cancel',
      );
    });

    it('should throw if organization not found', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.cancelSubscription(ORG_ID)).rejects.toThrow(
        'No active subscription to cancel',
      );
    });
  });

  // ─── checkAndExpireTrials ─────────────────────────────────────────

  describe('checkAndExpireTrials', () => {
    it('should expire trialing orgs past their trial end date', async () => {
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]);
      prisma.organization.updateMany.mockResolvedValue({ count: 2 });

      await service.checkAndExpireTrials();

      expect(prisma.organization.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['org-1', 'org-2'] } },
        data: {
          planTier: 'FREE',
          subscriptionStatus: 'EXPIRED',
        },
      });
    });

    it('should not affect grandfathered orgs', async () => {
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
      prisma.organization.updateMany.mockResolvedValue({ count: 1 });

      await service.checkAndExpireTrials();

      const call = prisma.organization.findMany.mock.calls[0][0];
      expect(call.where.isGrandfathered).toBe(false);
    });
  });

  // ─── billing email recipient ──────────────────────────────────────

  describe('billing email recipient', () => {
    const owner = { email: 'owner@shop.ng', firstName: 'Ada', roles: ['SUPER_ADMIN'], organization: { posMode: 'RETAIL' } };
    const admin = { email: 'admin@shop.ng', firstName: 'Bayo', roles: ['ADMIN'], organization: { posMode: 'RETAIL' } };

    beforeEach(() => {
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
      prisma.organization.updateMany.mockResolvedValue({ count: 1 });
    });

    it("emails the owner (SUPER_ADMIN) — signup's only role — with the org's posMode", async () => {
      prisma.user.findMany.mockResolvedValue([admin, owner]);

      await service.checkAndExpireTrials();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            isActive: true,
            hasPlaceholderEmail: false,
            roles: { hasSome: ['SUPER_ADMIN', 'ADMIN'] },
          }),
        }),
      );
      expect(emailService.sendTrialExpiredEmail).toHaveBeenCalledWith('owner@shop.ng', 'Ada', 'RETAIL');
    });

    it('falls back to an ADMIN when the org has no active owner', async () => {
      prisma.user.findMany.mockResolvedValue([admin]);
      await service.checkAndExpireTrials();
      expect(emailService.sendTrialExpiredEmail).toHaveBeenCalledWith('admin@shop.ng', 'Bayo', 'RETAIL');
    });

    it('sends nothing when the org has no admin-tier user at all', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.checkAndExpireTrials();
      expect(emailService.sendTrialExpiredEmail).not.toHaveBeenCalled();
    });
  });

  // ─── checkAndExpireSubscriptions ──────────────────────────────────

  describe('checkAndExpireSubscriptions', () => {
    it('should expire cancelled and active subscriptions past end date', async () => {
      prisma.organization.updateMany.mockResolvedValue({ count: 2 });

      await service.checkAndExpireSubscriptions();

      expect(prisma.organization.updateMany).toHaveBeenCalledWith({
        where: {
          subscriptionStatus: { in: ['CANCELLED', 'ACTIVE'] },
          subscriptionEndDate: { lt: expect.any(Date) },
          isGrandfathered: false,
          OR: [{ pendingRenewalReference: null }, { pendingRenewalStartedAt: { lt: expect.any(Date) } }],
        },
        data: {
          planTier: 'FREE',
          subscriptionStatus: 'EXPIRED',
        },
      });
    });

    it("does not let one org's renewal failure block other orgs or the expiry sweep", async () => {
      // First findMany is the pending-bank-debit sweep (none); the second is the renewable orgs.
      prisma.organization.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'org-fail' }, { id: 'org-ok' }]);
      // First org's renewal blows up on an unrelated DB hiccup; second org simply has nothing to
      // renew (renewSubscription returns false rather than throwing) — both must still be attempted.
      prisma.organization.findUnique
        .mockRejectedValueOnce(new Error('DB hiccup'))
        .mockResolvedValueOnce(null);
      prisma.organization.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.checkAndExpireSubscriptions()).resolves.toBeUndefined();

      expect(prisma.organization.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.organization.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { planTier: 'FREE', subscriptionStatus: 'EXPIRED' } }),
      );
    });
  });

  // ─── getPaymentHistory ────────────────────────────────────────────

  describe('getPaymentHistory', () => {
    it('should return payment records for org', async () => {
      const mockPayments = [
        { id: 'p1', amount: 9900, paystackReference: 'REF-1' },
        { id: 'p2', amount: 9900, paystackReference: 'REF-2' },
      ];
      prisma.subscriptionPayment.findMany.mockResolvedValue(mockPayments);

      const result = await service.getPaymentHistory(ORG_ID);

      expect(result).toEqual(mockPayments);
      expect(prisma.subscriptionPayment.findMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array if no payments', async () => {
      prisma.subscriptionPayment.findMany.mockResolvedValue([]);

      const result = await service.getPaymentHistory(ORG_ID);

      expect(result).toEqual([]);
    });
  });

  // ─── Full lifecycle scenarios ─────────────────────────────────────

  describe('Lifecycle: upgrade before trial ends', () => {
    it('should transition from TRIALING/PRO to ACTIVE/BUSINESS', async () => {
      // Step 1: Org is trialing with 15 days left
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 15);

      prisma.organization.findUnique.mockResolvedValue({
        planTier: 'PRO',
        subscriptionStatus: 'TRIALING',
        billingPeriod: null,
        trialStartDate: new Date(),
        trialEndDate: trialEnd,
        subscriptionStartDate: null,
        subscriptionEndDate: null,
        isGrandfathered: false,
      });
      prisma.invoice.count.mockResolvedValue(10);
      prisma.user.count.mockResolvedValue(1);

      const planBefore = await service.getCurrentPlan(ORG_ID);
      expect(planBefore.effectivePlan).toBe('PRO');
      expect(planBefore.subscriptionStatus).toBe('TRIALING');
      expect(planBefore.trialDaysRemaining).toBeGreaterThan(0);

      // Step 2: User upgrades to BUSINESS
      let capturedUpdate: any;
      prisma.subscriptionPayment.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (fn: any) => {
        await fn({
          organization: {
            update: jest.fn().mockImplementation((args: any) => {
              capturedUpdate = args;
            }),
          },
          subscriptionPayment: { create: jest.fn() },
        });
      });

      await service.activateSubscription(ORG_ID, 'BUSINESS', 'MONTHLY', 'REF-UPGRADE', 40000);

      expect(capturedUpdate.data.planTier).toBe('BUSINESS');
      expect(capturedUpdate.data.subscriptionStatus).toBe('ACTIVE');
      expect(capturedUpdate.data.billingPeriod).toBe('MONTHLY');
      expect(capturedUpdate.data.subscriptionStartDate).toBeInstanceOf(Date);
      expect(capturedUpdate.data.subscriptionEndDate).toBeInstanceOf(Date);
    });
  });

  describe('Lifecycle: upgrade after trial expires', () => {
    it('should transition from EXPIRED/FREE back to ACTIVE/PRO', async () => {
      // Step 1: Trial has expired
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() - 5);

      prisma.organization.findUnique.mockResolvedValue({
        planTier: 'PRO',
        subscriptionStatus: 'TRIALING',
        billingPeriod: null,
        trialStartDate: new Date('2025-12-01'),
        trialEndDate: trialEnd,
        subscriptionStartDate: null,
        subscriptionEndDate: null,
        isGrandfathered: false,
      });
      prisma.invoice.count.mockResolvedValue(0);
      prisma.user.count.mockResolvedValue(1);

      const planBefore = await service.getCurrentPlan(ORG_ID);
      expect(planBefore.effectivePlan).toBe('FREE');
      expect(planBefore.trialDaysRemaining).toBe(0);

      // Step 2: Cron expires the trial
      prisma.organization.updateMany.mockResolvedValue({ count: 1 });
      await service.checkAndExpireTrials();

      // Step 3: User subscribes to PRO
      let capturedUpdate: any;
      prisma.subscriptionPayment.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (fn: any) => {
        await fn({
          organization: {
            update: jest.fn().mockImplementation((args: any) => {
              capturedUpdate = args;
            }),
          },
          subscriptionPayment: { create: jest.fn() },
        });
      });

      await service.activateSubscription(ORG_ID, 'PRO', 'ANNUAL', 'REF-RESUBSCRIBE', 99000);

      expect(capturedUpdate.data.planTier).toBe('PRO');
      expect(capturedUpdate.data.subscriptionStatus).toBe('ACTIVE');
      expect(capturedUpdate.data.billingPeriod).toBe('ANNUAL');

      // End date should be ~1 year from now
      const endDate = capturedUpdate.data.subscriptionEndDate;
      const startDate = capturedUpdate.data.subscriptionStartDate;
      const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThanOrEqual(364);
    });
  });

  describe('Lifecycle: subscribe then cancel', () => {
    it('should cancel active subscription and eventually expire', async () => {
      // Step 1: Cancel
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionStatus: 'ACTIVE',
      });
      prisma.organization.update.mockResolvedValue({});

      const cancelResult = await service.cancelSubscription(ORG_ID);
      expect(cancelResult.message).toContain('cancelled');

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        data: { subscriptionStatus: 'CANCELLED' },
      });

      // Step 2: Org is now CANCELLED but still within billing period
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 20);

      prisma.organization.findUnique.mockResolvedValue({
        planTier: 'PRO',
        subscriptionStatus: 'CANCELLED',
        billingPeriod: 'MONTHLY',
        trialStartDate: null,
        trialEndDate: null,
        subscriptionStartDate: new Date('2025-01-15'),
        subscriptionEndDate: endDate,
        isGrandfathered: false,
      });
      prisma.invoice.count.mockResolvedValue(0);
      prisma.user.count.mockResolvedValue(1);

      const planDuring = await service.getCurrentPlan(ORG_ID);
      expect(planDuring.effectivePlan).toBe('PRO'); // still has access

      // Step 3: After billing period ends, cron expires subscription
      prisma.organization.updateMany.mockResolvedValue({ count: 1 });
      await service.checkAndExpireSubscriptions();

      expect(prisma.organization.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { planTier: 'FREE', subscriptionStatus: 'EXPIRED' },
        }),
      );
    });
  });

  // ─── bank-account (Direct Debit) renewals ─────────────────────────

  describe('bank-account renewals', () => {
    const charge = () => paystackService.chargeAuthorization as jest.Mock;
    const baseOrg = {
      planTier: 'PRO',
      billingPeriod: 'MONTHLY',
      paystackAuthorizationCode: 'AUTH_card',
      paystackBillingEmail: 'owner@example.com',
      paystackCardType: 'visa',
      paystackCardLast4: '4081',
      directDebitStatus: 'ACTIVE',
      directDebitAuthorizationCode: 'AUTH_bank',
      directDebitEmail: 'admin@example.com',
      pendingRenewalReference: null,
    };
    let activate: jest.SpyInstance;

    beforeEach(() => {
      activate = jest.spyOn(service, 'activateSubscription').mockResolvedValue(undefined);
      prisma.organization.update.mockResolvedValue({});
    });

    it('charges the bank mandate first and leaves the saved card alone', async () => {
      prisma.organization.findUnique.mockResolvedValue(baseOrg);
      charge().mockResolvedValue({ success: true, pending: false, reference: 'R1', status: 'success' });

      await expect(service.renewSubscription(ORG_ID)).resolves.toBe(true);

      expect(charge()).toHaveBeenCalledTimes(1);
      expect(charge().mock.calls[0].slice(0, 3)).toEqual(['admin@example.com', 5000000, 'AUTH_bank']);
      expect(activate).toHaveBeenCalledWith(
        ORG_ID, 'PRO', 'MONTHLY', 'R1', 50000,
        undefined, undefined, undefined, undefined, { keepPaymentMethod: true },
      );
    });

    it('treats a processing debit as in progress: no failure email, no card charge, marked pending', async () => {
      prisma.user.findMany.mockResolvedValue([{ email: 'a@b.com', firstName: 'A', roles: ['SUPER_ADMIN'], organization: { posMode: 'RESTAURANT' } }]);
      prisma.organization.findUnique.mockResolvedValue(baseOrg);
      charge().mockResolvedValue({ success: false, pending: true, reference: 'R2', status: 'processing' });

      await expect(service.renewSubscription(ORG_ID)).resolves.toBe(true);

      expect(charge()).toHaveBeenCalledTimes(1);
      expect(activate).not.toHaveBeenCalled();
      expect(emailService.sendRenewalFailedEmail).not.toHaveBeenCalled();
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        data: { pendingRenewalReference: 'R2', pendingRenewalStartedAt: expect.any(Date) },
      });
    });

    it('falls back to the card when the bank debit fails outright', async () => {
      prisma.organization.findUnique.mockResolvedValue(baseOrg);
      charge()
        .mockResolvedValueOnce({ success: false, pending: false, reference: 'R3', status: 'failed' })
        .mockResolvedValueOnce({ success: true, pending: false, reference: 'R4', status: 'success' });

      await expect(service.renewSubscription(ORG_ID)).resolves.toBe(true);

      expect(charge()).toHaveBeenCalledTimes(2);
      expect(charge().mock.calls[1][2]).toBe('AUTH_card');
      expect(activate).toHaveBeenCalledWith(
        ORG_ID, 'PRO', 'MONTHLY', 'R4', 50000, 'AUTH_card', 'owner@example.com', 'visa', '4081',
      );
    });

    it('keeps annual renewals (over the bank-debit cap) on the card', async () => {
      prisma.organization.findUnique.mockResolvedValue({ ...baseOrg, billingPeriod: 'ANNUAL' });
      charge().mockResolvedValue({ success: true, pending: false, reference: 'R5', status: 'success' });

      await service.renewSubscription(ORG_ID);

      expect(charge()).toHaveBeenCalledTimes(1);
      expect(charge().mock.calls[0][2]).toBe('AUTH_card');
    });

    it('does not charge again while an earlier bank debit is still settling', async () => {
      prisma.organization.findUnique.mockResolvedValue({ ...baseOrg, pendingRenewalReference: 'R2' });

      await expect(service.renewSubscription(ORG_ID)).resolves.toBe(false);

      expect(charge()).not.toHaveBeenCalled();
    });

    it('does not use a mandate that is not active yet', async () => {
      prisma.organization.findUnique.mockResolvedValue({ ...baseOrg, directDebitStatus: 'PENDING' });
      charge().mockResolvedValue({ success: true, pending: false, reference: 'R6', status: 'success' });

      await service.renewSubscription(ORG_ID);

      expect(charge().mock.calls[0][2]).toBe('AUTH_card');
    });

    it('emails the admin when there is no usable payment method', async () => {
      prisma.user.findMany.mockResolvedValue([{ email: 'a@b.com', firstName: 'A', roles: ['SUPER_ADMIN'], organization: { posMode: 'RESTAURANT' } }]);
      prisma.organization.findUnique.mockResolvedValue({
        ...baseOrg, paystackAuthorizationCode: null, directDebitStatus: null, directDebitAuthorizationCode: null,
      });

      await expect(service.renewSubscription(ORG_ID)).resolves.toBe(false);

      expect(charge()).not.toHaveBeenCalled();
      expect(emailService.sendRenewalFailedEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('reconcilePendingRenewals', () => {
    const status = () => paystackService.getTransactionStatus as jest.Mock;
    const pendingOrg = (startedHoursAgo: number) => ({
      id: ORG_ID,
      planTier: 'PRO',
      billingPeriod: 'MONTHLY',
      pendingRenewalReference: 'R2',
      pendingRenewalStartedAt: new Date(Date.now() - startedHoursAgo * 3600 * 1000),
      paystackAuthorizationCode: 'AUTH_card',
      paystackBillingEmail: 'owner@example.com',
      paystackCardType: 'visa',
      paystackCardLast4: '4081',
    });
    let activate: jest.SpyInstance;

    beforeEach(() => {
      activate = jest.spyOn(service, 'activateSubscription').mockResolvedValue(undefined);
      prisma.organization.update.mockResolvedValue({});
    });

    it('activates a debit that has settled', async () => {
      prisma.organization.findMany.mockResolvedValue([pendingOrg(5)]);
      status().mockResolvedValue({ status: 'success', amount: 3500000 });

      await service.reconcilePendingRenewals();

      expect(activate).toHaveBeenCalledWith(
        ORG_ID, 'PRO', 'MONTHLY', 'R2', 35000,
        undefined, undefined, undefined, undefined, { keepPaymentMethod: true },
      );
    });

    it('leaves a debit that is still settling alone', async () => {
      prisma.organization.findMany.mockResolvedValue([pendingOrg(5)]);
      status().mockResolvedValue({ status: 'processing', amount: 3500000 });

      await service.reconcilePendingRenewals();

      expect(activate).not.toHaveBeenCalled();
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('clears a failed debit and tries the card', async () => {
      prisma.organization.findMany.mockResolvedValue([pendingOrg(5)]);
      status().mockResolvedValue({ status: 'failed', amount: 3500000, gatewayResponse: 'Insufficient funds' });
      (paystackService.chargeAuthorization as jest.Mock).mockResolvedValue({ success: true, pending: false, reference: 'R9', status: 'success' });

      await service.reconcilePendingRenewals();

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        data: { pendingRenewalReference: null, pendingRenewalStartedAt: null },
      });
      expect((paystackService.chargeAuthorization as jest.Mock).mock.calls[0][2]).toBe('AUTH_card');
    });

    it('gives up on a debit that has been settling for more than three days', async () => {
      prisma.organization.findMany.mockResolvedValue([{ ...pendingOrg(24 * 4), paystackAuthorizationCode: null }]);
      status().mockResolvedValue({ status: 'processing', amount: 3500000 });
      prisma.user.findMany.mockResolvedValue([{ email: 'a@b.com', firstName: 'A', roles: ['SUPER_ADMIN'], organization: { posMode: 'RESTAURANT' } }]);

      await service.reconcilePendingRenewals();

      expect(emailService.sendRenewalFailedEmail).toHaveBeenCalledTimes(1);
    });

    it('does nothing when Paystack cannot be reached', async () => {
      prisma.organization.findMany.mockResolvedValue([pendingOrg(5)]);
      status().mockResolvedValue(null);

      await service.reconcilePendingRenewals();

      expect(activate).not.toHaveBeenCalled();
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });
  });

  describe('direct debit mandate', () => {
    beforeEach(() => prisma.organization.update.mockResolvedValue({}));

    it('starts a mandate and stores it as pending against the admin email', async () => {
      prisma.organization.findUnique.mockResolvedValue({ subscriptionStatus: 'ACTIVE', isGrandfathered: false, directDebitStatus: null });
      (paystackService.initializeDirectDebitAuthorization as jest.Mock).mockResolvedValue({ redirectUrl: 'https://link.paystack.com/x', reference: 'ref1' });

      const result = await service.setupDirectDebit(ORG_ID, 'admin@example.com');

      expect(result).toEqual({ paymentUrl: 'https://link.paystack.com/x', reference: 'ref1' });
      expect(paystackService.initializeDirectDebitAuthorization).toHaveBeenCalledWith(
        'admin@example.com',
        'http://localhost:5173/payment/callback?type=direct_debit',
      );
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        data: expect.objectContaining({ directDebitStatus: 'PENDING', directDebitReference: 'ref1', directDebitEmail: 'admin@example.com' }),
      });
    });

    it('requires an active paid plan first', async () => {
      prisma.organization.findUnique.mockResolvedValue({ subscriptionStatus: 'TRIALING', isGrandfathered: false, directDebitStatus: null });

      await expect(service.setupDirectDebit(ORG_ID, 'a@b.com')).rejects.toThrow(BadRequestException);
      expect(paystackService.initializeDirectDebitAuthorization).not.toHaveBeenCalled();
    });

    it('will not replace a mandate that is already active', async () => {
      prisma.organization.findUnique.mockResolvedValue({ subscriptionStatus: 'ACTIVE', isGrandfathered: false, directDebitStatus: 'ACTIVE' });

      await expect(service.setupDirectDebit(ORG_ID, 'a@b.com')).rejects.toThrow(/already linked/);
    });

    it('marks the mandate active and stores its authorization when Paystack says so', async () => {
      prisma.organization.findFirst.mockResolvedValue({ id: ORG_ID, directDebitEmail: 'admin@example.com' });

      await service.handleDirectDebitEvent('direct_debit.authorization.active', {
        reference: 'ref1',
        authorization: { authorization_code: 'AUTH_bank', bank: 'Zenith Bank', account_number: '0123456789' },
        customer: { email: 'admin@example.com' },
      });

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        data: {
          directDebitStatus: 'ACTIVE',
          directDebitAuthorizationCode: 'AUTH_bank',
          directDebitEmail: 'admin@example.com',
          directDebitBankName: 'Zenith Bank',
          directDebitAccountLast4: '6789',
        },
      });
    });

    it('ignores a mandate event that matches no organization', async () => {
      prisma.organization.findFirst.mockResolvedValue(null);

      await service.handleDirectDebitEvent('direct_debit.authorization.active', { reference: 'nope' });

      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('removes the mandate at Paystack and locally', async () => {
      prisma.organization.findUnique.mockResolvedValue({ directDebitAuthorizationCode: 'AUTH_bank' });

      await service.removeDirectDebit(ORG_ID);

      expect(paystackService.deactivateAuthorization).toHaveBeenCalledWith('AUTH_bank');
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        data: expect.objectContaining({ directDebitStatus: null, directDebitAuthorizationCode: null }),
      });
    });
  });

  // ─── first payment by bank account, with a grace period ───────────

  describe('first payment by bank account', () => {
    const okInit = { status: true, data: { authorization_url: 'https://checkout.paystack.com/x', reference: 'ref-bank', access_code: 'ac' } };

    it('opens bank-only checkout for a monthly plan and records the mandate as pending', async () => {
      mockFetch.mockResolvedValue({ json: async () => okInit });
      prisma.user.count.mockResolvedValue(1);
      prisma.organization.findUnique.mockResolvedValue({ isTestAccount: true });
      prisma.organization.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.subscribe(ORG_ID, 'PRO', 'MONTHLY', 'admin@example.com', 'BANK');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.channels).toEqual(['direct_debit']);
      expect(String(mockFetch.mock.calls[1][0])).toContain('/transaction/verify_access_code/ac');
      expect(body.metadata.payment_method).toBe('BANK');
      expect(result.paymentUrl).toBe('https://checkout.paystack.com/x');
      expect(prisma.organization.updateMany).toHaveBeenCalledWith({
        where: { id: ORG_ID, OR: [{ directDebitStatus: null }, { directDebitStatus: { not: 'ACTIVE' } }] },
        data: { directDebitStatus: 'PENDING', directDebitEmail: 'admin@example.com', directDebitReference: 'ref-bank' },
      });
    });

    it('does not offer bank payment for an annual plan above the cap', async () => {
      prisma.user.count.mockResolvedValue(1);
      prisma.organization.findUnique.mockResolvedValue({ isTestAccount: false });

      await expect(service.subscribe(ORG_ID, 'PRO', 'ANNUAL', 'a@b.com', 'BANK')).rejects.toThrow(/by card/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('keeps bank payment closed to ordinary orgs until it is switched on', async () => {
      prisma.user.count.mockResolvedValue(1);
      prisma.organization.findUnique.mockResolvedValue({ isTestAccount: false });

      await expect(service.subscribe(ORG_ID, 'PRO', 'MONTHLY', 'a@b.com', 'BANK')).rejects.toThrow(/not available yet/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('turns a Paystack "No active channel" checkout into a clear message, not a dead page', async () => {
      mockFetch
        .mockResolvedValueOnce({ json: async () => okInit })
        .mockResolvedValueOnce({ json: async () => ({ status: false, message: 'No active channel to process transaction. Please contact merchant' }) });
      prisma.user.count.mockResolvedValue(1);
      prisma.organization.findUnique.mockResolvedValue({ isTestAccount: true });

      await expect(service.subscribe(ORG_ID, 'PRO', 'MONTHLY', 'a@b.com', 'BANK')).rejects.toThrow(/not available right now/);
      expect(prisma.organization.updateMany).not.toHaveBeenCalled();
    });

    it('still pays by card by default', async () => {
      mockFetch.mockResolvedValue({ json: async () => okInit });
      prisma.user.count.mockResolvedValue(1);

      await service.subscribe(ORG_ID, 'PRO', 'MONTHLY', 'a@b.com');

      expect(JSON.parse(mockFetch.mock.calls[0][1].body).channels).toEqual(['card']);
      expect(prisma.organization.updateMany).not.toHaveBeenCalled();
    });

    const verifyResponse = (status: string, paymentMethod = 'BANK', extra: object = {}) => ({
      json: async () => ({
        status: true,
        data: {
          status,
          amount: 3500000,
          metadata: { type: 'subscription', organization_id: ORG_ID, plan_tier: 'PRO', billing_period: 'MONTHLY', payment_method: paymentMethod },
          customer: { email: 'admin@example.com' },
          ...extra,
        },
      }),
    });

    it('turns the plan on for a 24 hour grace while a first bank payment is processing', async () => {
      mockFetch.mockResolvedValue(verifyResponse('processing'));
      prisma.organization.findUnique.mockResolvedValue({ pendingRenewalReference: null, subscriptionEndDate: null, subscriptionStatus: 'TRIALING' });
      prisma.organization.update.mockResolvedValue({});

      const before = Date.now();
      const result = await service.verifyAndActivatePayment(ORG_ID, 'ref-bank');

      expect(result).toMatchObject({ activated: false, pending: true, graceHours: 24 });
      const data = prisma.organization.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ planTier: 'PRO', subscriptionStatus: 'ACTIVE', billingPeriod: 'MONTHLY', pendingRenewalReference: 'ref-bank' });
      expect(data.subscriptionEndDate.getTime() - before).toBeGreaterThan(23.9 * 3600 * 1000);
      expect(data.subscriptionEndDate.getTime() - before).toBeLessThan(24.1 * 3600 * 1000);
    });

    it('does not shorten time an active org has already paid for when upgrading by bank', async () => {
      const paidUntil = new Date(Date.now() + 20 * 24 * 3600 * 1000);
      mockFetch.mockResolvedValue(verifyResponse('processing'));
      prisma.organization.findUnique.mockResolvedValue({ pendingRenewalReference: null, subscriptionEndDate: paidUntil, subscriptionStatus: 'ACTIVE' });
      prisma.organization.update.mockResolvedValue({});

      await service.verifyAndActivatePayment(ORG_ID, 'ref-bank');

      expect(prisma.organization.update.mock.calls[0][0].data.subscriptionEndDate).toBe(paidUntil);
    });

    it('does not grant grace twice for the same payment', async () => {
      mockFetch.mockResolvedValue(verifyResponse('processing'));
      prisma.organization.findUnique.mockResolvedValue({ pendingRenewalReference: 'ref-bank', subscriptionEndDate: null, subscriptionStatus: 'ACTIVE' });

      await service.verifyAndActivatePayment(ORG_ID, 'ref-bank');

      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('does not treat a processing card payment as paid', async () => {
      mockFetch.mockResolvedValue(verifyResponse('processing', 'CARD'));

      await expect(service.verifyAndActivatePayment(ORG_ID, 'ref-card')).rejects.toThrow('Payment verification failed');
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('still rejects a failed payment', async () => {
      mockFetch.mockResolvedValue(verifyResponse('failed'));

      await expect(service.verifyAndActivatePayment(ORG_ID, 'ref-bank')).rejects.toThrow('Payment verification failed');
    });

    it('keeps the bank mandate (and not a card) when a first bank payment succeeds', async () => {
      const activate = jest.spyOn(service, 'activateSubscription').mockResolvedValue(undefined);
      prisma.organization.update.mockResolvedValue({});
      mockFetch.mockResolvedValue(
        verifyResponse('success', 'BANK', { authorization: { authorization_code: 'AUTH_bank', reusable: true, channel: 'direct_debit', bank: 'Zenith Bank', last4: '6789' } }),
      );

      await service.verifyAndActivatePayment(ORG_ID, 'ref-bank');

      expect(activate).toHaveBeenCalledWith(
        ORG_ID, 'PRO', 'MONTHLY', 'ref-bank', 35000,
        undefined, undefined, undefined, undefined, { keepPaymentMethod: true },
      );
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        data: {
          directDebitStatus: 'ACTIVE',
          directDebitAuthorizationCode: 'AUTH_bank',
          directDebitEmail: 'admin@example.com',
          directDebitBankName: 'Zenith Bank',
          directDebitAccountLast4: '6789',
        },
      });
    });
  });

  // ─── test-account pricing ─────────────────────────────────────────

  describe('test accounts pay a token amount', () => {
    const okInit = { status: true, data: { authorization_url: 'https://checkout.paystack.com/x', reference: 'r', access_code: 'a' } };

    it('charges 100 naira (10000 kobo) for any plan when the org is a test account', async () => {
      mockFetch.mockResolvedValue({ json: async () => okInit });
      prisma.user.count.mockResolvedValue(1);
      prisma.organization.findUnique.mockResolvedValue({ isTestAccount: true });

      await service.subscribe(ORG_ID, 'BUSINESS', 'ANNUAL', 'a@b.com', 'CARD');

      expect(JSON.parse(mockFetch.mock.calls[0][1].body).amount).toBe(10000);
    });

    it('lets a test account pay an annual plan by bank, since the amount is tiny', async () => {
      mockFetch.mockResolvedValue({ json: async () => okInit });
      prisma.user.count.mockResolvedValue(1);
      prisma.organization.findUnique.mockResolvedValue({ isTestAccount: true });
      prisma.organization.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.subscribe(ORG_ID, 'BUSINESS', 'ANNUAL', 'a@b.com', 'BANK')).resolves.toBeDefined();
    });

    it('still charges the real price for an ordinary org', async () => {
      mockFetch.mockResolvedValue({ json: async () => okInit });
      prisma.user.count.mockResolvedValue(1);
      prisma.organization.findUnique.mockResolvedValue({ isTestAccount: false });

      await service.subscribe(ORG_ID, 'PRO', 'MONTHLY', 'a@b.com');

      expect(JSON.parse(mockFetch.mock.calls[0][1].body).amount).toBe(5000000);
    });

    it('renews a test account for the token amount too', async () => {
      jest.spyOn(service, 'activateSubscription').mockResolvedValue(undefined);
      prisma.organization.findUnique.mockResolvedValue({
        planTier: 'PRO', billingPeriod: 'MONTHLY', isTestAccount: true,
        paystackAuthorizationCode: 'AUTH_card', paystackBillingEmail: 'o@x.com', paystackCardType: 'visa', paystackCardLast4: '4081',
        directDebitStatus: null, directDebitAuthorizationCode: null, directDebitEmail: null, pendingRenewalReference: null,
      });
      (paystackService.chargeAuthorization as jest.Mock).mockResolvedValue({ success: true, pending: false, reference: 'R', status: 'success' });

      await service.renewSubscription(ORG_ID);

      expect((paystackService.chargeAuthorization as jest.Mock).mock.calls[0][1]).toBe(10000);
    });
  });
});
