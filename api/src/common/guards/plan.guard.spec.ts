import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlanGuard } from './plan.guard';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { REQUIRES_PLAN_KEY } from '../decorators/plan.decorator';

function createMockPrisma() {
  return {
    organization: {
      findUnique: jest.fn(),
    },
  };
}

function makeContext(user: object | null, handler = {}, cls = {}) {
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as any;
}

describe('PlanGuard', () => {
  let guard: PlanGuard;
  let prisma: ReturnType<typeof createMockPrisma>;
  let reflector: { getAllAndOverride: jest.Mock };

  const ORG_ID = 'org-abc-123';

  const baseOrg = {
    planTier: 'PRO' as const,
    subscriptionStatus: 'ACTIVE' as const,
    trialEndDate: null,
    subscriptionEndDate: null,
    isGrandfathered: false,
  };

  const baseUser = { id: 'user-1', organizationId: ORG_ID, isPlatformAdmin: false };

  beforeEach(async () => {
    prisma = createMockPrisma();
    reflector = { getAllAndOverride: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();

    guard = module.get<PlanGuard>(PlanGuard);
    jest.clearAllMocks();
  });

  // ─── No plan requirement ────────────────────────────────────────────

  it('returns true when no plan is required on the route', async () => {
    reflector.getAllAndOverride.mockReturnValue(null);
    const ctx = makeContext(baseUser);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('returns true when required plans array is empty', async () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    const ctx = makeContext(baseUser);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ─── Missing user / org ─────────────────────────────────────────────

  it('throws ForbiddenException when there is no user on the request', async () => {
    reflector.getAllAndOverride.mockReturnValue(['PRO']);
    const ctx = makeContext(null);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when organization is not found', async () => {
    reflector.getAllAndOverride.mockReturnValue(['PRO']);
    prisma.organization.findUnique.mockResolvedValue(null);
    const ctx = makeContext(baseUser);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ─── Platform admin bypass ──────────────────────────────────────────

  it('returns true for platform admin regardless of plan', async () => {
    reflector.getAllAndOverride.mockReturnValue(['BUSINESS']);
    const ctx = makeContext({ ...baseUser, isPlatformAdmin: true });
    // Should NOT query DB at all
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  // ─── Grandfathered org bypass ───────────────────────────────────────

  it('returns true for grandfathered org on any plan', async () => {
    reflector.getAllAndOverride.mockReturnValue(['BUSINESS']);
    prisma.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      planTier: 'FREE',
      isGrandfathered: true,
    });
    const ctx = makeContext(baseUser);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ─── Active trial (within period) ──────────────────────────────────

  it('grants PRO access to org actively trialling PRO (trial not expired)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['PRO']);
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days ahead
    prisma.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      planTier: 'PRO',
      subscriptionStatus: 'TRIALING',
      trialEndDate: futureDate,
    });
    const ctx = makeContext(baseUser);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('denies PRO access to org whose trial has expired (TRIALING status, past end date)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['PRO']);
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
    prisma.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      planTier: 'PRO',
      subscriptionStatus: 'TRIALING',
      trialEndDate: pastDate,
    });
    const ctx = makeContext(baseUser);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ─── EXPIRED status ─────────────────────────────────────────────────

  it('denies PRO access when subscription status is EXPIRED', async () => {
    reflector.getAllAndOverride.mockReturnValue(['PRO']);
    prisma.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      planTier: 'PRO',
      subscriptionStatus: 'EXPIRED',
    });
    const ctx = makeContext(baseUser);

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PLAN_UPGRADE_REQUIRED' }),
    });
  });

  it('allows FREE routes when subscription status is EXPIRED', async () => {
    reflector.getAllAndOverride.mockReturnValue(['FREE']);
    prisma.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      planTier: 'PRO',
      subscriptionStatus: 'EXPIRED',
    });
    const ctx = makeContext(baseUser);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ─── Active subscription ────────────────────────────────────────────

  it('grants PRO access to ACTIVE PRO subscriber', async () => {
    reflector.getAllAndOverride.mockReturnValue(['PRO']);
    prisma.organization.findUnique.mockResolvedValue({ ...baseOrg, planTier: 'PRO', subscriptionStatus: 'ACTIVE' });
    const ctx = makeContext(baseUser);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('denies BUSINESS access to ACTIVE PRO subscriber', async () => {
    reflector.getAllAndOverride.mockReturnValue(['BUSINESS']);
    prisma.organization.findUnique.mockResolvedValue({ ...baseOrg, planTier: 'PRO', subscriptionStatus: 'ACTIVE' });
    const ctx = makeContext(baseUser);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('grants BUSINESS access to ACTIVE BUSINESS subscriber', async () => {
    reflector.getAllAndOverride.mockReturnValue(['BUSINESS']);
    prisma.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      planTier: 'BUSINESS',
      subscriptionStatus: 'ACTIVE',
    });
    const ctx = makeContext(baseUser);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('grants PRO access to ACTIVE BUSINESS subscriber (higher plan satisfies lower requirement)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['PRO']);
    prisma.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      planTier: 'BUSINESS',
      subscriptionStatus: 'ACTIVE',
    });
    const ctx = makeContext(baseUser);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('denies PRO access to FREE plan org', async () => {
    reflector.getAllAndOverride.mockReturnValue(['PRO']);
    prisma.organization.findUnique.mockResolvedValue({ ...baseOrg, planTier: 'FREE', subscriptionStatus: 'ACTIVE' });
    const ctx = makeContext(baseUser);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ─── CANCELLED subscription ─────────────────────────────────────────

  it('grants PRO access for CANCELLED subscription still within end date', async () => {
    reflector.getAllAndOverride.mockReturnValue(['PRO']);
    const futureEndDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    prisma.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      planTier: 'PRO',
      subscriptionStatus: 'CANCELLED',
      subscriptionEndDate: futureEndDate,
    });
    const ctx = makeContext(baseUser);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('denies PRO access for CANCELLED subscription past end date', async () => {
    reflector.getAllAndOverride.mockReturnValue(['PRO']);
    const pastEndDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    prisma.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      planTier: 'PRO',
      subscriptionStatus: 'CANCELLED',
      subscriptionEndDate: pastEndDate,
    });
    const ctx = makeContext(baseUser);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ─── Error payload ──────────────────────────────────────────────────

  it('includes PLAN_UPGRADE_REQUIRED code and required plan in the error', async () => {
    reflector.getAllAndOverride.mockReturnValue(['PRO']);
    prisma.organization.findUnique.mockResolvedValue({ ...baseOrg, planTier: 'FREE', subscriptionStatus: 'ACTIVE' });
    const ctx = makeContext(baseUser);

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: {
        code: 'PLAN_UPGRADE_REQUIRED',
        requiredPlan: 'PRO',
        currentPlan: 'FREE',
      },
    });
  });

  it('uses the reflector key defined by REQUIRES_PLAN_KEY', async () => {
    reflector.getAllAndOverride.mockReturnValue(null);
    const handler = {};
    const cls = {};
    const ctx = makeContext(baseUser, handler, cls);
    await guard.canActivate(ctx);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(REQUIRES_PLAN_KEY, [handler, cls]);
  });
});
