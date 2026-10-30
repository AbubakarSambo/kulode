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
