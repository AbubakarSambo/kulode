import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgGoLiveService } from './org-go-live.service';
import { PrismaService } from '../prisma/prisma.service';

const ORG = { id: 'org-1', name: 'Mama Put Kitchen', wentLiveAt: null as Date | null };
const ADMIN = { id: 'admin-1', email: 'admin@tarione.com' };

function model() {
  return {
    count: jest.fn().mockResolvedValue(0),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _min: { createdAt: null }, _max: { createdAt: null } }),
  };
}

function createMockPrisma() {
  const db = {
    organization: { ...model(), findUnique: jest.fn().mockResolvedValue({ ...ORG }) },
    order: model(),
    payment: model(),
    shift: model(),
    invoice: model(),
    expense: model(),
    walletTransaction: model(),
    moniepointUnreconciledTransfer: model(),
    whatsappMessage: model(),
    sheetSyncQueueEntry: model(),
    idempotencyKey: model(),
    taxReportLog: model(),
    stockMovement: model(),
    inventoryItem: model(),
    customer: model(),
    restaurantTable: model(),
    $transaction: jest.fn(),
  };
  db.organization.updateMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  return db;
}

describe('OrgGoLiveService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: OrgGoLiveService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new OrgGoLiveService(prisma as unknown as PrismaService);
  });

  it('refuses an org that already went live', async () => {
    prisma.organization.findUnique.mockResolvedValue({ ...ORG, wentLiveAt: new Date('2026-11-01') });
    await expect(service.goLive(ORG.id, { confirmName: ORG.name }, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.order.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses when the typed name does not match', async () => {
    await expect(service.goLive(ORG.id, { confirmName: 'Mama Put' }, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts the name regardless of case and surrounding spaces', async () => {
    await service.goLive(ORG.id, { confirmName: '  mama put kitchen ' }, ADMIN);
    expect(prisma.order.deleteMany).toHaveBeenCalledWith({ where: { organizationId: ORG.id } });
  });

  it('deletes nothing if another press claimed the org first', async () => {
    prisma.organization.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.goLive(ORG.id, { confirmName: ORG.name }, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.order.deleteMany).not.toHaveBeenCalled();
  });

  it('adds test-sale deductions back to on-hand stock and clears reservations', async () => {
    const d = (n: number) => new Prisma.Decimal(n);
    prisma.stockMovement.findMany.mockResolvedValue([
      { inventoryItemId: 'rice', onHandBefore: d(10), onHandAfter: d(8) },
      { inventoryItemId: 'rice', onHandBefore: d(8), onHandAfter: d(7) },
      { inventoryItemId: 'beer', onHandBefore: d(5), onHandAfter: d(5) },
    ]);

    await service.goLive(ORG.id, { confirmName: ORG.name }, ADMIN);

    expect(prisma.inventoryItem.update).toHaveBeenCalledTimes(1);
    const call = prisma.inventoryItem.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'rice' });
    expect(call.data.onHandQuantity.decrement.toNumber()).toBe(-3);
    expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG.id },
      data: { reservedQuantity: 0 },
    });
  });

  it('only deletes stock movements that came from trading, keeping restocks and adjustments', async () => {
    await service.goLive(ORG.id, { confirmName: ORG.name }, ADMIN);
    const where = prisma.stockMovement.deleteMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([{ orderId: { not: null } }, { invoiceId: { not: null } }]),
    );
    const types = where.OR.find((c: { type?: unknown }) => c.type).type.in;
    expect(types).not.toContain('RESTOCK');
    expect(types).not.toContain('ADJUSTMENT');
  });

  it('keeps customers but zeroes wallet balances by default', async () => {
    await service.goLive(ORG.id, { confirmName: ORG.name }, ADMIN);
    expect(prisma.customer.deleteMany).not.toHaveBeenCalled();
    expect(prisma.customer.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG.id },
      data: { walletBalance: 0 },
    });
  });

  it('deletes customers when asked', async () => {
    await service.goLive(ORG.id, { confirmName: ORG.name, deleteCustomers: true }, ADMIN);
    expect(prisma.customer.deleteMany).toHaveBeenCalledWith({ where: { organizationId: ORG.id } });
  });

  it('never touches setup data', async () => {
    await service.goLive(ORG.id, { confirmName: ORG.name }, ADMIN);
    expect(prisma.restaurantTable.deleteMany).not.toHaveBeenCalled();
    expect(prisma.inventoryItem.deleteMany).not.toHaveBeenCalled();
  });

  it('records who ran it and what was deleted', async () => {
    prisma.order.count.mockResolvedValue(47);
    const result = await service.goLive(ORG.id, { confirmName: ORG.name }, ADMIN);
    expect(result.counts.orders).toBe(47);
    expect(result.ranBy).toEqual(ADMIN);
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { goLiveSummary: expect.objectContaining({ ranBy: ADMIN }) } }),
    );
  });
});
