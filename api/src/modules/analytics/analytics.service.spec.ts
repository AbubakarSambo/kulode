import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  const original = process.env.POSTHOG_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.POSTHOG_API_KEY;
    else process.env.POSTHOG_API_KEY = original;
  });

  it('does nothing without a PostHog key, and never touches the database', async () => {
    delete process.env.POSTHOG_API_KEY;
    const prisma = { organization: { findUnique: jest.fn() } };
    const analytics = new AnalyticsService(prisma as never);
    const isFirst = jest.fn().mockResolvedValue(true);

    expect(analytics.enabled).toBe(false);
    expect(() => analytics.capture('org-1', 'anything', { a: 1 })).not.toThrow();
    await analytics.milestone('org-1', 'first_order_created', isFirst);

    expect(isFirst).not.toHaveBeenCalled();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('records a milestone once, with how long after signup it happened, and only when it is the first', async () => {
    process.env.POSTHOG_API_KEY = 'phc_test';
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ createdAt: new Date(Date.now() - 3 * 86_400_000 - 1000), posMode: 'RESTAURANT', planTier: 'PRO' }),
      },
    };
    const analytics = new AnalyticsService(prisma as never);
    const capture = jest.spyOn(analytics, 'capture').mockImplementation(() => undefined);

    await analytics.milestone('org-1', 'first_order_closed', async () => false);
    expect(capture).not.toHaveBeenCalled();

    await analytics.milestone('org-1', 'first_order_closed', async () => true);
    expect(capture).toHaveBeenCalledWith('org-1', 'first_order_closed', { days_since_signup: 3, pos_mode: 'RESTAURANT', plan_tier: 'PRO' });
    await analytics.onModuleDestroy();
  });

  it('swallows a failing "is it the first?" check so a real action is never affected', async () => {
    process.env.POSTHOG_API_KEY = 'phc_test';
    const analytics = new AnalyticsService({ organization: { findUnique: jest.fn() } } as never);

    await expect(analytics.milestone('org-1', 'first_order_created', async () => Promise.reject(new Error('db down')))).resolves.toBeUndefined();
    await analytics.onModuleDestroy();
  });
});
