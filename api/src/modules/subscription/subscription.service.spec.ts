import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SubscriptionService } from './subscription.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

function createMockPrisma() {
  return {
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    invoice: {
      count: jest.fn(),
    },
    user: {
      count: jest.fn(),
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

  const ORG_ID = 'org-12345678-abcd';

  beforeEach(async () => {
    prisma = createMockPrisma();
    configService = createMockConfig();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
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
      expect(result.limits.maxUsers).toBe(3);
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
      expect(result.limits.maxInvoicesPerMonth).toBe(50);
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

      // Verify the correct amount was sent (9900 * 100 = 990000 kobo)
      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.amount).toBe(990000);
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
      expect(body.amount).toBe(40000000); // 400000 * 100 kobo
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
      prisma.organization.updateMany.mockResolvedValue({ count: 3 });

      await service.checkAndExpireTrials();

      expect(prisma.organization.updateMany).toHaveBeenCalledWith({
        where: {
          subscriptionStatus: 'TRIALING',
          trialEndDate: { lt: expect.any(Date) },
          isGrandfathered: false,
        },
        data: {
          planTier: 'FREE',
          subscriptionStatus: 'EXPIRED',
        },
      });
    });

    it('should not affect grandfathered orgs', async () => {
      prisma.organization.updateMany.mockResolvedValue({ count: 0 });

      await service.checkAndExpireTrials();

      const call = prisma.organization.updateMany.mock.calls[0][0];
      expect(call.where.isGrandfathered).toBe(false);
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
        },
        data: {
          planTier: 'FREE',
          subscriptionStatus: 'EXPIRED',
        },
      });
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
});
