import { BadRequestException } from '@nestjs/common';
import { TipsService } from './tips.service';

const ORG = 'org-1';
const MANAGER = { id: 'mgr-1', roles: ['MANAGER'] };

function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    tipLedgerEntry: {
      aggregate: jest.fn(),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'entry-1', createdAt: new Date('2026-11-26T09:00:00Z'), ...data })),
    },
    idempotencyKey: { create: jest.fn(), update: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    organization: { findUniqueOrThrow: jest.fn().mockResolvedValue({ timezone: 'Africa/Lagos', tipsEnabled: true, tipPresets: [1000, 3000, 5000] }), update: jest.fn() },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }), findMany: jest.fn().mockResolvedValue([{ id: 'w1', firstName: 'Amina', lastName: 'B' }]) },
    tipLedgerEntry: { groupBy: jest.fn() },
  };
  const orders = { resolveApprover: jest.fn().mockResolvedValue('mgr-1') };
  const service = new TipsService(prisma as never, orders as never);
  return { service, prisma, tx, orders };
}

describe('TipsService.recordPayout', () => {
  const dto = { waiterId: 'w1', amount: 5000, paidFrom: 'CASH_DRAWER' as const, clientRequestId: 'c0ffee00-0000-4000-8000-000000000000' };

  it('appends a negative payout stamped with the approver and the till as source', async () => {
    const { service, tx } = setup();
    tx.tipLedgerEntry.aggregate.mockResolvedValue({ _sum: { amount: 18000 } });

    const res = await service.recordPayout(ORG, MANAGER, dto);

    expect(tx.tipLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ waiterId: 'w1', type: 'PAYOUT', amount: -5000, paidFrom: 'CASH_DRAWER', approvedById: 'mgr-1' }),
    });
    expect(res).toMatchObject({ amount: 5000, balance: 13000 });
  });

  it('refuses to pay out more than is owed', async () => {
    const { service, tx } = setup();
    tx.tipLedgerEntry.aggregate.mockResolvedValue({ _sum: { amount: 4000 } });
    await expect(service.recordPayout(ORG, MANAGER, dto)).rejects.toThrow(BadRequestException);
    expect(tx.tipLedgerEntry.create).not.toHaveBeenCalled();
  });

  it('refuses a payout to a waiter who owes the restaurant (negative balance)', async () => {
    const { service, tx } = setup();
    tx.tipLedgerEntry.aggregate.mockResolvedValue({ _sum: { amount: -3000 } });
    await expect(service.recordPayout(ORG, MANAGER, dto)).rejects.toThrow('exceeds the balance owed');
  });

  it('needs an approver: a cashier without a supervisor PIN is stopped before anything is written', async () => {
    const { service, tx, orders } = setup();
    orders.resolveApprover.mockRejectedValue(new Error('APPROVAL_REQUIRED'));
    await expect(service.recordPayout(ORG, { id: 'c1', roles: ['CASHIER'] }, dto)).rejects.toThrow('APPROVAL_REQUIRED');
    expect(tx.tipLedgerEntry.create).not.toHaveBeenCalled();
  });

  it('rejects a waiter from another organization', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.recordPayout(ORG, MANAGER, dto)).rejects.toThrow('Unknown staff member');
  });
});

describe('TipsService.owedReport', () => {
  it('carries an unpaid balance forward: opening balance is what was owed before the day began', async () => {
    const { service, prisma } = setup();
    // Whole ledger to end of day: earned 10,000 over two days, 4,000 paid → 6,000 owed.
    prisma.tipLedgerEntry.groupBy
      .mockResolvedValueOnce([
        { waiterId: 'w1', type: 'EARNED', paidFrom: null, _sum: { amount: 10000 } },
        { waiterId: 'w1', type: 'PAYOUT', paidFrom: 'CASH_DRAWER', _sum: { amount: -4000 } },
      ])
      // Inside the day: earned 3,000, nothing paid.
      .mockResolvedValueOnce([{ waiterId: 'w1', type: 'EARNED', _sum: { amount: 3000 } }]);

    const report = await service.owedReport(ORG, { from: '2026-11-26' });

    expect(report.rows).toEqual([
      expect.objectContaining({ name: 'Amina B', openingBalance: 3000, earned: 3000, paidOut: 0, balance: 6000 }),
    ]);
    expect(report.totals.balance).toBe(6000);
  });

  it('shows tips on ownerless orders as an Unassigned row', async () => {
    const { service, prisma } = setup();
    prisma.tipLedgerEntry.groupBy
      .mockResolvedValueOnce([{ waiterId: null, type: 'EARNED', paidFrom: null, _sum: { amount: 1000 } }])
      .mockResolvedValueOnce([{ waiterId: null, type: 'EARNED', _sum: { amount: 1000 } }]);
    const report = await service.owedReport(ORG, { from: '2026-11-26' });
    expect(report.rows[0]).toMatchObject({ waiterId: null, name: 'Unassigned', balance: 1000 });
  });

  it('rejects a malformed or backwards date range', async () => {
    const { service } = setup();
    await expect(service.owedReport(ORG, { from: '26/11/2026' })).rejects.toThrow('Invalid date range');
    await expect(service.owedReport(ORG, { from: '2026-11-26', to: '2026-11-25' })).rejects.toThrow('Invalid date range');
  });
});
