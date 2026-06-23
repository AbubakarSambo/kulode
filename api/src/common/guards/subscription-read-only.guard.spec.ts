import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionReadOnlyGuard } from './subscription-read-only.guard';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

function createMockPrisma() {
  return {
    organization: {
      findUnique: jest.fn(),
    },
  };
}

function makeContext(user: any, method: string, url: string) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user, method, url }),
    }),
  } as any;
}

describe('SubscriptionReadOnlyGuard', () => {
  let guard: SubscriptionReadOnlyGuard;
  let prisma: ReturnType<typeof createMockPrisma>;
  let reflector: { getAllAndOverride: jest.Mock };

  const ORG_ID = 'org-abc-123';
  const baseOrg = {
    subscriptionStatus: 'ACTIVE' as const,
    trialEndDate: null,
    isGrandfathered: false,
  };
  const baseUser = { id: 'user-1', organizationId: ORG_ID, isPlatformAdmin: false };

  beforeEach(async () => {
    prisma = createMockPrisma();
    reflector = { getAllAndOverride: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionReadOnlyGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();

    guard = module.get<SubscriptionReadOnlyGuard>(SubscriptionReadOnlyGuard);
    jest.clearAllMocks();
  });

  it('returns true when route is public', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const ctx = makeContext(baseUser, 'POST', '/invoices');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('returns true for safe methods (GET, OPTIONS, HEAD)', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const ctx1 = makeContext(baseUser, 'GET', '/invoices');
    const ctx2 = makeContext(baseUser, 'OPTIONS', '/invoices');
    const ctx3 = makeContext(baseUser, 'HEAD', '/invoices');

    await expect(guard.canActivate(ctx1)).resolves.toBe(true);
    await expect(guard.canActivate(ctx2)).resolves.toBe(true);
    await expect(guard.canActivate(ctx3)).resolves.toBe(true);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('returns true for whitelisted write routes (auth, subscription, paystack)', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const ctx1 = makeContext(baseUser, 'POST', '/api/v1/auth/logout');
    const ctx2 = makeContext(baseUser, 'POST', '/api/v1/subscription/subscribe');
    const ctx3 = makeContext(baseUser, 'POST', '/api/v1/paystack/webhooks');

    await expect(guard.canActivate(ctx1)).resolves.toBe(true);
    await expect(guard.canActivate(ctx2)).resolves.toBe(true);
    await expect(guard.canActivate(ctx3)).resolves.toBe(true);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('returns true for platform admin even if expired', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const ctx = makeContext({ ...baseUser, isPlatformAdmin: true }, 'POST', '/invoices');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('returns true for grandfathered org even if expired', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    prisma.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      subscriptionStatus: 'EXPIRED',
      isGrandfathered: true,
    });
    const ctx = makeContext(baseUser, 'POST', '/invoices');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows write methods for active subscriptions', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    prisma.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      subscriptionStatus: 'ACTIVE',
    });
    const ctx = makeContext(baseUser, 'POST', '/invoices');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows write methods for trialling subscriptions with future trial date', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    prisma.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      subscriptionStatus: 'TRIALING',
      trialEndDate: new Date(Date.now() + 1000 * 60 * 60 * 24), // tomorrow
    });
    const ctx = makeContext(baseUser, 'POST', '/invoices');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('denies write methods (throws ForbiddenException) for expired subscriptions', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    prisma.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      subscriptionStatus: 'EXPIRED',
    });
    const ctx = makeContext(baseUser, 'POST', '/invoices');
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('denies write methods (throws ForbiddenException) for expired trials', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    prisma.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      subscriptionStatus: 'TRIALING',
      trialEndDate: new Date(Date.now() - 1000 * 60 * 60 * 24), // yesterday
    });
    const ctx = makeContext(baseUser, 'POST', '/invoices');
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
