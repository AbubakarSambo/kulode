import { LeaderboardService } from './leaderboard.service';

const ORG = 'org-1';
const user = (id: string, roles: string[]) => ({ id, organizationId: ORG, roles }) as never;

describe('LeaderboardService', () => {
  const setup = (settings: unknown = null) => {
    const prisma: any = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ shiftStartTime: '00:00', shiftEndTime: '23:59', leaderboardSettings: settings }),
        update: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'w1', firstName: 'Ada', lastName: 'O' },
          { id: 'w2', firstName: 'Bayo', lastName: 'K' },
        ]),
      },
      paymentType: { findMany: jest.fn().mockResolvedValue([{ name: 'LR Complimentary' }]) },
      order: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([{ waiterId: 'w1', _sum: { total: 90000 }, _count: 3 }]) // by waiter
          .mockResolvedValueOnce([
            { createdById: 'w1', _sum: { total: 10000 }, _count: 1 }, // Ada's order with no waiter set
            { createdById: 'w2', _sum: { total: 30000 }, _count: 1 },
          ]),
      },
    };
    return { prisma, service: new LeaderboardService(prisma) };
  };

  it('counts an order for its waiter, or for whoever rang it up when it has none, and leaves comps out', async () => {
    const { prisma, service } = setup();
    const result = await service.getLeaderboard(user('w1', ['WAITER']), { from: '2026-11-05' });

    expect(result.entries.map((e) => [e.name, e.revenue])).toEqual([['Ada O', 100000], ['Bayo K', null]]);
    expect(prisma.order.groupBy.mock.calls[0][0].where).toMatchObject({
      status: 'CLOSED_PAID',
      payments: { none: { paymentMethod: { in: ['LR Complimentary'] } } },
    });
    expect(prisma.order.groupBy.mock.calls[1][0].where).toMatchObject({ waiterId: null });
  });

  it("only includes the org's configured roles", async () => {
    const { prisma, service } = setup({ roles: ['WAITER'] });
    await service.getLeaderboard(user('w1', ['WAITER']), { from: '2026-11-05' });
    expect(prisma.user.findMany.mock.calls[0][0].where.roles).toEqual({ hasSome: ['WAITER'] });
  });

  it('falls back to the first enabled metric when the requested one is switched off', async () => {
    const { service } = setup({ metrics: ['REVENUE'] });
    const result = await service.getLeaderboard(user('w1', ['WAITER']), { from: '2026-11-05', metric: 'AVG_CHECK' });
    expect(result.metric).toBe('REVENUE');
  });

  it('lets a manager see everyone\'s amounts', async () => {
    const { service } = setup();
    const result = await service.getLeaderboard(user('mgr', ['MANAGER']), { from: '2026-11-05' });
    expect(result.entries.every((e) => e.revenue !== null)).toBe(true);
    expect(result.canCompete).toBe(false);
  });

  it('merges a settings update over the current settings and validates the result', async () => {
    const { prisma, service } = setup({ topN: 8 });
    const next = await service.updateSettings(ORG, { minOrders: 10, topN: 99 });
    expect(next).toMatchObject({ topN: 20, minOrders: 10 });
    expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: ORG }, data: { leaderboardSettings: next } });
  });
});
