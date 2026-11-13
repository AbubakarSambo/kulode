import { BadRequestException } from '@nestjs/common';
import { LoyaltyReportsService } from './loyalty.reports.service';

function setup() {
  const prisma: any = {
    organization: { findUniqueOrThrow: jest.fn().mockResolvedValue({ timezone: 'Africa/Lagos' }) },
    customer: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
    loyaltyLedger: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
    loyaltyReward: {
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _count: 0, _sum: { redeemedFoodCost: null, redeemedMenuPrice: null } }),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValueOnce([{ spend: null, orders: 0n }]).mockResolvedValueOnce([{ count: 0n, cost: null }]),
  };
  return { prisma, service: new LoyaltyReportsService(prisma) };
}

describe('LoyaltyReportsService.summary', () => {
  it('defaults to the last 30 days ending today', async () => {
    const { service } = setup();
    const r = await service.summary('org-1');
    const days = (new Date(r.range.to).getTime() - new Date(r.range.from).getTime()) / 86_400_000;
    expect(days).toBe(29);
  });

  it('rejects malformed dates and a start after the end', async () => {
    const { service } = setup();
    await expect(service.summary('org-1', '12/11/2026', '2026-11-30')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.summary('org-1', '2026-12-01', '2026-11-01')).rejects.toThrow('after the end');
  });

  it('is all zeros (never NaN or a divide-by-zero) when nothing has happened', async () => {
    const { service } = setup();
    const r = await service.summary('org-1', '2026-11-01', '2026-11-30');
    expect(r.spend).toEqual({ total: 0, member: 0, nonMember: 0, memberSharePct: 0, orders: 0 });
    expect(r.cost).toEqual({ foodCost: 0, menuValue: 0, pctOfMemberSpend: 0 });
    expect(r.members.byStaff).toEqual([]);
  });

  it('never reports more member spend than total spend, and names staff (or "Former staff")', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockReset().mockResolvedValueOnce([{ spend: 100000, orders: 3n }]).mockResolvedValueOnce([{ count: 0n, cost: null }]);
    prisma.loyaltyLedger.aggregate.mockResolvedValue({ _sum: { amount: 150000 } }); // ledger can include spend from outside the order window
    prisma.customer.groupBy.mockResolvedValue([
      { enrolledById: 'u1', _count: 3 },
      { enrolledById: 'gone', _count: 1 },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 'u1', firstName: 'Ada', lastName: 'Eze' }]);
    const r = await service.summary('org-1', '2026-11-01', '2026-11-30');
    expect(r.spend).toMatchObject({ total: 100000, member: 100000, nonMember: 0, memberSharePct: 100 });
    expect(r.members.byStaff).toEqual([
      { userId: 'u1', name: 'Ada Eze', count: 3 },
      { userId: 'gone', name: 'Former staff', count: 1 },
    ]);
  });
});
