import { BadRequestException } from '@nestjs/common';
import { MoniepointService } from './moniepoint.service';

jest.mock('../loyalty/loyalty.earn', () => ({ creditOrderSpendSafe: jest.fn().mockResolvedValue(null) }));

const ORG = { id: 'org-1', tipsEnabled: true };

function order(overrides: object = {}) {
  return {
    id: 'order-1',
    organizationId: 'org-1',
    status: 'READY',
    source: 'Dine In',
    total: 23500,
    amountPaid: 0,
    pendingTipAmount: 0,
    tableId: 'table-1',
    waiterId: 'waiter-amina',
    table: { name: 'T6' },
    ...overrides,
  };
}

function setup(orders: object[], org = ORG) {
  const tx = {
    order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    payment: { create: jest.fn() },
    tip: { create: jest.fn().mockResolvedValue({ id: 'tip-1' }) },
    tipLedgerEntry: { create: jest.fn() },
    restaurantTable: { update: jest.fn() },
  };
  const prisma = {
    organization: { findFirst: jest.fn().mockResolvedValue(org), findUnique: jest.fn().mockResolvedValue(org) },
    order: {
      findMany: jest.fn().mockResolvedValue(orders),
      findFirst: jest.fn().mockResolvedValue(orders[0] ?? null),
      count: jest.fn().mockResolvedValue(2),
    },
    moniepointUnreconciledTransfer: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const inventory = { deductForOrder: jest.fn() };
  const service = new MoniepointService(
    { get: jest.fn().mockReturnValue('') } as never,
    prisma as never,
    inventory as never,
    {} as never,
  );
  const reconcile = (amountNaira: number, source: 'TRANSFER' | 'CARD' = 'TRANSFER') =>
    (service as unknown as { attemptAmountReconciliation: (d: unknown, s: string) => Promise<unknown> }).attemptAmountReconciliation(
      { amount: amountNaira * 100, businessId: 'biz-1', transactionReference: 'ref-1' },
      source,
    );
  return { service, prisma, tx, reconcile };
}

describe('Moniepoint reconciliation with tips', () => {
  it('matches bill + the tip the guest announced, closes the order on the bill alone, and holds the tip', async () => {
    const { prisma, tx, reconcile } = setup([order({ pendingTipAmount: 3000 })]);

    const res = await reconcile(26500);

    expect(res).toMatchObject({ reconciled: true });
    expect(prisma.moniepointUnreconciledTransfer.create).not.toHaveBeenCalled();
    expect(tx.payment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 23500, paymentMethod: 'MONIEPOINT_TRANSFER' }) });
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountPaid: 23500, status: 'CLOSED_PAID' }) }),
    );
    expect(tx.tip.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: 'order-1', amount: 3000, paymentMethod: 'MONIEPOINT_TRANSFER', recordedById: null }),
    });
    expect(tx.tipLedgerEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ waiterId: 'waiter-amina', type: 'EARNED', amount: 3000 }) });
  });

  it('records a card tip under the card method', async () => {
    const { tx, reconcile } = setup([order({ pendingTipAmount: 1000 })]);
    await reconcile(24500, 'CARD');
    expect(tx.tip.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 1000, paymentMethod: 'MONIEPOINT_POS' }) });
  });

  it('records no tip when the guest paid the bill alone, even with a tip announced', async () => {
    const { tx, reconcile } = setup([order({ pendingTipAmount: 3000 })]);
    await reconcile(23500);
    expect(tx.tip.create).not.toHaveBeenCalled();
    expect(tx.payment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 23500 }) });
  });

  it('does not expect a tip when tipping is switched off — bill + tip falls to manual review', async () => {
    const { prisma, tx, reconcile } = setup([order({ pendingTipAmount: 3000 })], { id: 'org-1', tipsEnabled: false });
    const res = await reconcile(26500);
    expect(res).toMatchObject({ reconciled: false });
    expect(prisma.moniepointUnreconciledTransfer.create).toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('leaves an unannounced overpayment for manual review', async () => {
    const { prisma, reconcile } = setup([order()]);
    const res = await reconcile(26500);
    expect(res).toMatchObject({ reconciled: false });
    expect(prisma.moniepointUnreconciledTransfer.create).toHaveBeenCalled();
  });

  it('does not mint a tip when the payment arrives after the order was already closed', async () => {
    const { tx, reconcile } = setup([order({ pendingTipAmount: 3000 })]);
    tx.order.updateMany.mockResolvedValue({ count: 0 });
    await reconcile(26500);
    expect(tx.tip.create).not.toHaveBeenCalled();
  });
});

describe('assigning an unreconciled transfer, extra as tip', () => {
  const transfer = { id: 't-1', status: 'PENDING_REVIEW', amount: 26500, source: 'TRANSFER', transactionReference: 'ref-1' };

  it('records the amount over the bill as a tip for the order’s waiter', async () => {
    const { service, prisma, tx } = setup([order()]);
    prisma.moniepointUnreconciledTransfer.findFirst.mockResolvedValue(transfer);

    await service.assignUnreconciledTransfer('org-1', 't-1', 'order-1', 'mgr-1', { excessAsTip: true });

    expect(tx.payment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 23500, recordedById: 'mgr-1' }) });
    expect(tx.tip.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 3000, recordedById: 'mgr-1' }) });
  });

  it('keeps today’s behaviour when the flag is not set', async () => {
    const { service, prisma, tx } = setup([order()]);
    prisma.moniepointUnreconciledTransfer.findFirst.mockResolvedValue(transfer);
    await service.assignUnreconciledTransfer('org-1', 't-1', 'order-1', 'mgr-1');
    expect(tx.tip.create).not.toHaveBeenCalled();
  });

  it('refuses when the transfer is not more than the amount due', async () => {
    const { service, prisma } = setup([order()]);
    prisma.moniepointUnreconciledTransfer.findFirst.mockResolvedValue({ ...transfer, amount: 23500 });
    await expect(service.assignUnreconciledTransfer('org-1', 't-1', 'order-1', 'mgr-1', { excessAsTip: true })).rejects.toThrow(
      'no tip to record',
    );
  });

  it('asks for confirmation on a very large tip', async () => {
    const { service, prisma } = setup([order()]);
    prisma.moniepointUnreconciledTransfer.findFirst.mockResolvedValue({ ...transfer, amount: 60000 });
    await expect(service.assignUnreconciledTransfer('org-1', 't-1', 'order-1', 'mgr-1', { excessAsTip: true })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TIP_CONFIRMATION_REQUIRED' }),
    });
    await expect(service.assignUnreconciledTransfer('org-1', 't-1', 'order-1', 'mgr-1', { excessAsTip: true, tipConfirmed: true })).resolves.toBeDefined();
  });

  it('refuses when tipping is switched off', async () => {
    const { service, prisma } = setup([order()], { id: 'org-1', tipsEnabled: false });
    prisma.moniepointUnreconciledTransfer.findFirst.mockResolvedValue(transfer);
    await expect(service.assignUnreconciledTransfer('org-1', 't-1', 'order-1', 'mgr-1', { excessAsTip: true })).rejects.toThrow(BadRequestException);
  });
});
