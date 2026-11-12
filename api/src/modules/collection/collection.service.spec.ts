import { ConflictException } from '@nestjs/common';
import { CollectionService } from './collection.service';

const ORG = 'org-1';
const me = { id: 'w1', organizationId: ORG, roles: ['WAITER'] } as never;
const period = {
  id: 'p1', organizationId: ORG, name: 'Nov drive', startDate: '2026-11-08', endDate: '2026-11-30',
  rolesInScope: ['WAITER'], minimum: 140, threshold: 175, coverageGoalPct: 70, status: 'OPEN',
};

function setup(over: Partial<Record<string, any>> = {}) {
  const prisma: any = {
    organization: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Africa/Lagos' }) },
    collectionPeriod: { findFirst: jest.fn().mockResolvedValue(period), create: jest.fn(), update: jest.fn() },
    collectionOverride: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'w1', firstName: 'Ada', lastName: 'O' },
        { id: 'w2', firstName: 'Bayo', lastName: 'K' },
        { id: 'w3', firstName: 'Chi', lastName: 'N' },
      ]),
    },
    phoneCredit: {
      groupBy: jest.fn()
        .mockResolvedValueOnce([
          { userId: 'w1', _count: 60, _max: { capturedAt: new Date('2026-11-14T10:00:00Z') } },
          { userId: 'w2', _count: 60, _max: { capturedAt: new Date('2026-11-14T09:00:00Z') } },
        ])
        .mockResolvedValueOnce([{ userId: 'w1', _count: 7 }]),
      findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ total: BigInt(200), with_phone: BigInt(100) }]),
    ...over,
  };
  return { prisma, service: new CollectionService(prisma) };
}

describe('CollectionService.getLeaderboard', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-11-15T11:00:00Z')));
  afterEach(() => jest.useRealTimers());

  it('ranks by count, breaks ties by who got there first, and puts zero-credit staff last', async () => {
    const { service } = setup();
    const res: any = await service.getLeaderboard(me);
    expect(res.entries.map((e: any) => [e.rank, e.name, e.count])).toEqual([[1, 'Bayo K', 60], [2, 'Ada O', 60], [3, 'Chi N', 0]]);
    expect(res.entries.find((e: any) => e.name === 'Ada O')).toMatchObject({ today: 7, isMe: true });
  });

  it('colours each row by pace on 15 Nov (min 49 / green 61)', async () => {
    const { service } = setup();
    const res: any = await service.getLeaderboard(me);
    expect(res.entries.map((e: any) => e.zone)).toEqual(['NORMAL', 'NORMAL', 'RED']);
    expect(res.team).toEqual({ count: 120, minimum: 420, threshold: 525 });
  });

  it('adds opening counts and honours per-person targets', async () => {
    const { service, prisma } = setup();
    prisma.collectionOverride.findMany.mockResolvedValue([{ userId: 'w3', minimum: 20, threshold: 40, openingCount: 25 }]);
    const res: any = await service.getLeaderboard(me);
    expect(res.entries.find((e: any) => e.name === 'Chi N')).toMatchObject({ count: 25, minimum: 20, threshold: 40, zone: 'GREEN' });
  });

  it('reports phone coverage', async () => {
    const { service } = setup();
    expect(((await service.getLeaderboard(me)) as any).coverage).toEqual({ customers: 200, withPhone: 100, pct: 50 });
  });

  it('returns no period when none is configured', async () => {
    const { service, prisma } = setup();
    prisma.collectionPeriod.findFirst.mockResolvedValue(null);
    expect(await service.getLeaderboard(me)).toEqual({ period: null });
  });
});

describe('CollectionService.revokeCredit', () => {
  const manager = { id: 'm1', organizationId: ORG, roles: ['MANAGER'] } as never;
  const credit = { id: 'cr1', organizationId: ORG, capturedAt: new Date('2026-11-14T10:00:00Z'), revokedAt: null };

  it('revokes with a reason', async () => {
    const { service, prisma } = setup();
    prisma.phoneCredit.findFirst.mockResolvedValue(credit);
    prisma.collectionPeriod.findFirst.mockResolvedValue(null); // no locked period
    await service.revokeCredit(manager, 'cr1', 'made up');
    expect(prisma.phoneCredit.updateMany.mock.calls[0][0].data).toMatchObject({ revokedById: 'm1', revokeReason: 'made up' });
  });

  it('refuses once the period is locked, and refuses a double revoke', async () => {
    const { service, prisma } = setup();
    prisma.phoneCredit.findFirst.mockResolvedValue(credit);
    prisma.collectionPeriod.findFirst.mockResolvedValue({ name: 'Nov drive' });
    await expect(service.revokeCredit(manager, 'cr1', 'x')).rejects.toThrow(/locked/);

    prisma.phoneCredit.findFirst.mockResolvedValue({ ...credit, revokedAt: new Date() });
    await expect(service.revokeCredit(manager, 'cr1', 'x')).rejects.toThrow(ConflictException);
  });
});

describe('CollectionService.createPeriod', () => {
  it('rejects bad dates, a threshold below the minimum, and overlapping periods', async () => {
    const { service, prisma } = setup();
    const dto = { name: 'x', startDate: '2026-12-01', endDate: '2026-12-10', rolesInScope: ['WAITER'], minimum: 10, threshold: 20 };
    await expect(service.createPeriod(ORG, { ...dto, endDate: '2026-11-01' })).rejects.toThrow('End date');
    await expect(service.createPeriod(ORG, { ...dto, threshold: 5 })).rejects.toThrow('threshold');
    prisma.collectionPeriod.findFirst.mockResolvedValue({ name: 'Nov drive' });
    await expect(service.createPeriod(ORG, dto)).rejects.toThrow(/overlap/);
  });
});

describe('CollectionService outcome and lock', () => {
  const endedPeriod = { ...period, rewardAmount: 40000, deductionPct: 10, lockedAt: null };
  const staffRows = [
    { id: 'w1', firstName: 'Ada', lastName: 'O' },
    { id: 'w2', firstName: 'Bayo', lastName: 'K' },
    { id: 'w3', firstName: 'Chi', lastName: 'N' },
    { id: 'w4', firstName: 'Dayo', lastName: 'P' },
  ];
  // Finals: Ada 175 (Green), Bayo 140 (Normal), Chi 139 (Red), Dayo 120 + 60 opening = 180 (Green)
  const withCounts = (periodOverride: object = {}) => {
    const { prisma, service } = setup();
    prisma.collectionPeriod.findFirst.mockResolvedValue({ ...endedPeriod, ...periodOverride });
    prisma.user.findMany.mockResolvedValue(staffRows);
    prisma.collectionOverride.findMany.mockResolvedValue([{ userId: 'w4', minimum: null, threshold: null, openingCount: 60 }]);
    prisma.phoneCredit.groupBy = jest
      .fn()
      .mockResolvedValueOnce([
        { userId: 'w1', _count: 175, _max: { capturedAt: new Date('2026-11-20T10:00:00Z') } },
        { userId: 'w2', _count: 140, _max: { capturedAt: new Date('2026-11-21T10:00:00Z') } },
        { userId: 'w3', _count: 139, _max: { capturedAt: new Date('2026-11-22T10:00:00Z') } },
        { userId: 'w4', _count: 120, _max: { capturedAt: new Date('2026-11-23T10:00:00Z') } },
      ])
      .mockResolvedValueOnce([]);
    prisma.collectionPeriodResult = { findMany: jest.fn(), createMany: jest.fn().mockResolvedValue({ count: 4 }) };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    prisma.collectionPeriod.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    return { prisma, service };
  };

  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-12-01T10:00:00Z')));
  afterEach(() => jest.useRealTimers());

  it('P8: reports each person\'s zone with the incentive for Green and the deduction for Red', async () => {
    const { service } = withCounts();
    const out = await service.getOutcome(ORG, 'p1');
    expect(out.rows.map((r) => [r.name, r.count, r.zone, r.incentiveAmount, r.deductionPct])).toEqual([
      ['Dayo P', 180, 'GREEN', 40000, 0],
      ['Ada O', 175, 'GREEN', 40000, 0],
      ['Bayo K', 140, 'NORMAL', 0, 0],
      ['Chi N', 139, 'RED', 0, 10],
    ]);
    expect(out.totals).toEqual({ incentiveDue: 80000, deductions: 1 });
    expect(out.provisional).toBe(true);
    expect(out.ended).toBe(true);
  });

  it('reads the frozen snapshot, not live counts, once locked', async () => {
    const { prisma, service } = withCounts({ status: 'LOCKED' });
    prisma.collectionPeriodResult.findMany.mockResolvedValue([
      { userId: 'w1', name: 'Ada O', count: 175, minimum: 140, threshold: 175, zone: 'GREEN', incentiveAmount: 40000, deductionPct: 0 },
    ]);
    const out = await service.getOutcome(ORG, 'p1');
    expect(out.provisional).toBe(false);
    expect(out.rows).toHaveLength(1);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('refuses to lock a period that has not ended', async () => {
    jest.setSystemTime(new Date('2026-11-30T10:00:00Z')); // last day: still running
    const { service } = withCounts();
    await expect(service.lockPeriod(ORG, 'p1')).rejects.toThrow(/not ended/);
  });

  it('locks the day after the end date: flips status once and writes a result per person', async () => {
    const { prisma, service } = withCounts();
    const res = await service.lockPeriod(ORG, 'p1');
    expect(res).toMatchObject({ locked: true, results: 4 });
    expect(prisma.collectionPeriod.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'p1', status: 'OPEN' }, data: { status: 'LOCKED' } });
    const data = prisma.collectionPeriodResult.createMany.mock.calls[0][0].data;
    expect(data.find((d: any) => d.userId === 'w3')).toMatchObject({ count: 139, zone: 'RED', deductionPct: 10, incentiveAmount: 0 });
    expect(data.find((d: any) => d.userId === 'w1')).toMatchObject({ zone: 'GREEN', incentiveAmount: 40000 });
  });

  it('loses a locking race quietly: no results written twice', async () => {
    const { prisma, service } = withCounts();
    prisma.collectionPeriod.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.lockPeriod(ORG, 'p1')).toMatchObject({ locked: false, alreadyLocked: true });
    expect(prisma.collectionPeriodResult.createMany).not.toHaveBeenCalled();
  });

  it('is a no-op on a period that is already locked', async () => {
    const { prisma, service } = withCounts({ status: 'LOCKED' });
    expect(await service.lockPeriod(ORG, 'p1')).toMatchObject({ alreadyLocked: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('the hourly job locks only periods that ended in their own timezone, and survives one failing', async () => {
    const { prisma, service } = withCounts();
    prisma.collectionPeriod.findMany = jest.fn().mockResolvedValue([
      { ...endedPeriod, id: 'ended', endDate: '2026-11-30', organizationId: ORG, organization: { timezone: 'Africa/Lagos' } },
      { ...endedPeriod, id: 'running', endDate: '2026-12-01', organizationId: ORG, organization: { timezone: 'Africa/Lagos' } },
      { ...endedPeriod, id: 'broken', endDate: '2026-11-01', organizationId: ORG, organization: { timezone: 'Africa/Lagos' } },
    ]);
    const lock = jest.spyOn(service, 'lockPeriod').mockImplementation(async (_o, id) => {
      if (id === 'broken') throw new Error('boom');
      return { locked: true, alreadyLocked: false, results: 3 };
    });
    expect(await service.lockDuePeriods()).toBe(1);
    expect(lock.mock.calls.map((c) => c[1])).toEqual(['ended', 'broken']);
  });

  it('writes a payroll CSV that says it is provisional until locked', async () => {
    const { service } = withCounts();
    const { filename, csv } = await service.outcomeCsv(ORG, 'p1');
    expect(filename).toBe('phone-collection-nov-drive-provisional.csv');
    expect(csv).toContain('Chi N,139,140,175,RED,Deduction applies,0,10,PROVISIONAL (period not locked)');
    expect(csv).toContain('Dayo P,180,140,175,GREEN,Incentive due,40000,0,PROVISIONAL (period not locked)');
  });
});
