import { PosDashboardService, previousComparableRange } from './pos-dashboard.service';

const at = (iso: string) => new Date(iso);

describe('previousComparableRange', () => {
  // An 08:00 → 02:00 business day, as applyShiftHours builds it for "Today".
  const todayStart = at('2026-10-23T08:00:00.000Z');
  const todayEnd = at('2026-10-24T02:00:00.000Z');

  it('compares today-so-far with yesterday up to the same time of day', () => {
    const prev = previousComparableRange(todayStart, todayEnd, at('2026-10-23T14:00:00.000Z'));
    expect(prev.startDate.toISOString()).toBe('2026-10-22T08:00:00.000Z');
    expect(prev.endDate.toISOString()).toBe('2026-10-22T14:00:00.000Z');
  });

  it('compares a finished business day with the whole previous business day', () => {
    const prev = previousComparableRange(todayStart, todayEnd, at('2026-10-24T09:00:00.000Z'));
    expect(prev.startDate.toISOString()).toBe('2026-10-22T08:00:00.000Z');
    expect(prev.endDate.toISOString()).toBe('2026-10-23T02:00:00.000Z');
  });

  it('steps a week back by seven days', () => {
    const prev = previousComparableRange(at('2026-10-11T00:00:00.000Z'), at('2026-10-17T23:59:59.000Z'), at('2026-10-23T12:00:00.000Z'));
    expect(prev.startDate.toISOString()).toBe('2026-10-04T00:00:00.000Z');
    expect(prev.endDate.toISOString()).toBe('2026-10-10T23:59:59.000Z');
  });

  it('never ends before it starts when now is before the period opens', () => {
    const prev = previousComparableRange(todayStart, todayEnd, at('2026-10-23T06:00:00.000Z'));
    expect(prev.endDate.getTime()).toBe(prev.startDate.getTime());
  });
});

describe('getTodayTakings', () => {
  type Agg = { _count: number; _sum: { total: number | null } };
  const setup = (paid: Agg, open: Agg, showTakingsStrip = true) => {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ shiftStartTime: '08:00', shiftEndTime: '02:00', showTakingsStrip }),
      },
      order: { aggregate: jest.fn().mockResolvedValueOnce(paid).mockResolvedValueOnce(open) },
    };
    return { prisma, service: new PosDashboardService(prisma as never) };
  };

  it('splits the day into paid and still-open order totals', async () => {
    const { service } = setup({ _count: 3, _sum: { total: 15000 } }, { _count: 2, _sum: { total: 4500 } });
    const result = await service.getTodayTakings('org-1');
    if (!result.enabled) throw new Error('expected enabled');
    expect(result.paid).toEqual({ count: 3, amount: 15000 });
    expect(result.open).toEqual({ count: 2, amount: 4500 });
    expect(result.total).toBe(19500);
  });

  it('counts awaiting-payment orders as open, by when they were created, scoped to the branch', async () => {
    const { prisma, service } = setup({ _count: 0, _sum: { total: null } }, { _count: 0, _sum: { total: null } });
    const result = await service.getTodayTakings('org-1');
    if (!result.enabled) throw new Error('expected enabled');
    const [paidCall, openCall] = prisma.order.aggregate.mock.calls.map((c) => c[0].where);
    expect(paidCall).toMatchObject({ organizationId: 'org-1', status: 'CLOSED_PAID', closedAt: { gte: result.period.startDate } });
    expect(openCall).toMatchObject({ organizationId: 'org-1', createdAt: { gte: result.period.startDate } });
    expect(openCall.status.in).toEqual(['OPEN', 'IN_KITCHEN', 'READY', 'CLOSED_UNPAID']);
    expect(result.total).toBe(0);
  });

  it("returns no figures at all when the org hasn't turned the strip on", async () => {
    const { prisma, service } = setup({ _count: 3, _sum: { total: 15000 } }, { _count: 2, _sum: { total: 4500 } }, false);
    expect(await service.getTodayTakings('org-1')).toEqual({ enabled: false });
    expect(prisma.order.aggregate).not.toHaveBeenCalled();
  });
});

describe('walletCreditForOrdersClosed', () => {
  it('sums only the part of each wallet charge that went below zero, skipping reversed charges', async () => {
    const prisma = {
      walletTransaction: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'd1', amount: -30000, balanceBefore: 10000 }, // ₦20k on credit
            { id: 'd2', amount: -5000, balanceBefore: 50000 }, // covered by balance
            { id: 'd3', amount: -8000, balanceBefore: 0 }, // reversed, ignored
          ])
          .mockResolvedValueOnce([{ reference: 'd3' }]),
      },
    };
    const service = new PosDashboardService(prisma as never);
    const credit = await (service as any).walletCreditForOrdersClosed('org-1', at('2026-11-01T00:00:00Z'), at('2026-11-02T00:00:00Z'));
    expect(credit).toBe(20000);
  });
});

describe('payment breakdown on the sales card', () => {
  const service = new PosDashboardService({} as never);
  const build = (service as any).buildPaymentBreakdown.bind(service);
  const row = (paymentMethod: string, amount: number, count: number) => ({ paymentMethod, _sum: { amount }, _count: count });

  it('splits money received into paid and other, takes wallet credit out of paid, and reports comps and owed separately', () => {
    const result = build(
      [row('Card (MP)', 100000, 4), row('Cash', 20000, 3), row('WALLET', 50000, 2), row('Cheque', 7000, 1)],
      12000, // over-balance part of wallet charges
      { _sum: { amount: 30000 }, _count: 5 }, // complimentary
      9000, // still owed on unpaid orders
    );
    expect(result.paid).toEqual({ count: 9, amount: 158000 }); // 100k + 20k + 50k wallet - 12k credit
    expect(result.other).toEqual({ count: 1, amount: 7000 });
    expect(result.complimentary).toEqual({ count: 5, amount: 30000 });
    expect(result.owed).toEqual({ amount: 21000, onWalletCredit: 12000 });
  });

  it('has no complimentary line when the org has no complimentary types', () => {
    expect(build([row('Cash', 1000, 1)], 0, null, 0).complimentary).toEqual({ count: 0, amount: 0 });
  });
});
