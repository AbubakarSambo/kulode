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
