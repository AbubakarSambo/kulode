import { SupermarketLiveService } from './supermarket-live.service';
import { SUPERMARKET_HELD_MAX_AGE_MIN, SUPERMARKET_HELD_TARGET, SUPERMARKET_ORG_SLUG, PRODUCTS } from './supermarket.constants';
import { PHARMACY_ORG_SLUG } from './pharmacy.constants';
import { DEMO_ORG_SLUG } from './demo.constants';

function createService(org: { slug: string; isTestAccount: boolean } | null, populating = false) {
  const prisma = {
    organization: { findUnique: jest.fn().mockResolvedValue(org) },
    order: { findMany: jest.fn(), count: jest.fn(), deleteMany: jest.fn() },
    shift: { findFirst: jest.fn() },
    heldSale: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
    inventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const ordersService = { create: jest.fn(), closeWithPayment: jest.fn(), cancel: jest.fn() };
  const walletService = { topUp: jest.fn() };
  const seedService = { isPopulating: jest.fn().mockReturnValue(populating), loadStaff: jest.fn() };
  const service = new SupermarketLiveService(prisma as any, ordersService as any, walletService as any, seedService as any);
  return { service, prisma, ordersService, seedService };
}

describe('SupermarketLiveService guards', () => {
  it('refuses a real business even if its id is in DEMO_ORG_IDS', async () => {
    const { service, ordersService, seedService } = createService({ slug: 'some-real-shop', isTestAccount: false });
    await service.tick('real-org');
    await service.prune('real-org');
    expect(seedService.loadStaff).not.toHaveBeenCalled();
    expect(ordersService.create).not.toHaveBeenCalled();
  });

  it.each([
    ['restaurant', DEMO_ORG_SLUG],
    ['pharmacy', PHARMACY_ORG_SLUG],
  ])('refuses the %s demo — the demos only act on their own org', async (_name, slug) => {
    const { service, ordersService, seedService } = createService({ slug, isTestAccount: true });
    await service.tick('other-demo-org');
    expect(seedService.loadStaff).not.toHaveBeenCalled();
    expect(ordersService.create).not.toHaveBeenCalled();
  });

  it('refuses the demo slug once it is no longer flagged as a test account', async () => {
    const { service, prisma } = createService({ slug: SUPERMARKET_ORG_SLUG, isTestAccount: false });
    await service.prune('demo-org');
    expect(prisma.order.deleteMany).not.toHaveBeenCalled();
    expect(prisma.heldSale.deleteMany).not.toHaveBeenCalled();
  });

  it('does nothing while a reset is rebuilding the data', async () => {
    const { service, prisma } = createService({ slug: SUPERMARKET_ORG_SLUG, isTestAccount: true }, true);
    await service.tick('demo-org');
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('accepts the demo supermarket', async () => {
    const { service } = createService({ slug: SUPERMARKET_ORG_SLUG, isTestAccount: true });
    await expect(service.isDemoOrg('demo-org')).resolves.toBe(true);
  });

  it('prunes old parked carts along with old sales', async () => {
    const { service, prisma } = createService({ slug: SUPERMARKET_ORG_SLUG, isTestAccount: true });
    prisma.order.deleteMany.mockResolvedValue({ count: 0 });
    (prisma as any).walletTransaction = { deleteMany: jest.fn() };
    (prisma as any).moniepointUnreconciledTransfer = { deleteMany: jest.fn(), updateMany: jest.fn() };
    (prisma as any).stockMovement = { deleteMany: jest.fn() };
    (prisma as any).payment = { deleteMany: jest.fn() };
    (prisma.shift as any).deleteMany = jest.fn();
    await service.prune('demo-org');
    expect(prisma.heldSale.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'demo-org', createdAt: { lt: expect.any(Date) } },
    });
  });
});

describe('SupermarketLiveService held carts', () => {
  const staff = { adminId: 'admin', managerId: 'mgr', cashierIds: ['c1', 'c2', 'c3'] };
  const key = '2026-11-14';
  const noon = new Date('2026-11-14T11:00:00Z'); // 12:00 Lagos, mid-trading

  const stocked = () =>
    PRODUCTS.map((p, i) => ({ id: `inv-${i}`, name: p.name, sellPrice: p.price }));

  it('parks fresh carts, from different lanes, up to the target when none are held', async () => {
    const { service, prisma } = createService({ slug: SUPERMARKET_ORG_SLUG, isTestAccount: true });
    prisma.inventoryItem.findMany.mockResolvedValue(stocked());

    await (service as any).refreshHeldSales('demo-org', staff, key, noon);

    expect(prisma.heldSale.create).toHaveBeenCalledTimes(SUPERMARKET_HELD_TARGET);
    for (const [{ data }] of prisma.heldSale.create.mock.calls) {
      expect(data.organizationId).toBe('demo-org');
      expect(staff.cashierIds).toContain(data.heldById);
      expect(data.items.length).toBeGreaterThanOrEqual(1);
      expect(data.items[0]).toEqual(
        expect.objectContaining({ inventoryItemId: expect.any(String), name: expect.any(String), quantity: expect.any(Number), unitPrice: expect.any(Number) }),
      );
      // parked a few minutes ago, never in the future
      expect(data.createdAt.getTime()).toBeLessThan(noon.getTime());
      expect(data.createdAt.getTime()).toBeGreaterThan(noon.getTime() - 15 * 60_000);
    }
  });

  it('tops up only the shortfall', async () => {
    const { service, prisma } = createService({ slug: SUPERMARKET_ORG_SLUG, isTestAccount: true });
    prisma.heldSale.count.mockResolvedValue(SUPERMARKET_HELD_TARGET - 1);
    prisma.inventoryItem.findMany.mockResolvedValue(stocked());
    await (service as any).refreshHeldSales('demo-org', staff, key, noon);
    expect(prisma.heldSale.create).toHaveBeenCalledTimes(1);
  });

  it('settles carts parked longer than the max age — mostly picked up, never left HELD', async () => {
    const { service, prisma } = createService({ slug: SUPERMARKET_ORG_SLUG, isTestAccount: true });
    prisma.heldSale.findMany.mockResolvedValue(Array.from({ length: 40 }, (_, i) => ({ id: `old-${i}` })));
    prisma.heldSale.count.mockResolvedValue(SUPERMARKET_HELD_TARGET);

    await (service as any).refreshHeldSales('demo-org', staff, key, noon);

    expect(prisma.heldSale.findMany.mock.calls[0][0].where.createdAt.lt.getTime()).toBe(
      noon.getTime() - SUPERMARKET_HELD_MAX_AGE_MIN * 60_000,
    );
    const statuses = prisma.heldSale.update.mock.calls.map(([a]: any) => a.data.status);
    expect(statuses).toHaveLength(40);
    expect(statuses.every((s: string) => s === 'RECALLED' || s === 'DISCARDED')).toBe(true);
    expect(statuses.filter((s: string) => s === 'RECALLED').length).toBeGreaterThan(statuses.filter((s: string) => s === 'DISCARDED').length);
    for (const [a] of prisma.heldSale.update.mock.calls as any[]) {
      if (a.data.status === 'RECALLED') expect(staff.cashierIds).toContain(a.data.recalledById);
    }
  });

  it('parks nothing in the last half hour before closing', async () => {
    const { service, prisma } = createService({ slug: SUPERMARKET_ORG_SLUG, isTestAccount: true });
    prisma.inventoryItem.findMany.mockResolvedValue(stocked());
    const lateEvening = new Date('2026-11-14T20:45:00Z'); // 21:45 Lagos
    await (service as any).refreshHeldSales('demo-org', staff, key, lateEvening);
    expect(prisma.heldSale.create).not.toHaveBeenCalled();
  });

  it('skips products that are not on the shelf instead of parking a broken cart', async () => {
    const { service, prisma } = createService({ slug: SUPERMARKET_ORG_SLUG, isTestAccount: true });
    prisma.inventoryItem.findMany.mockResolvedValue([]);
    await (service as any).refreshHeldSales('demo-org', staff, key, noon);
    expect(prisma.heldSale.create).not.toHaveBeenCalled();
  });

  it('expires whatever is still parked at closing, scoped to the org', async () => {
    const { service, prisma } = createService({ slug: SUPERMARKET_ORG_SLUG, isTestAccount: true });
    await (service as any).expireHeldSales('demo-org', noon);
    expect(prisma.heldSale.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'demo-org', status: 'HELD' },
      data: { status: 'EXPIRED', settledAt: noon },
    });
  });
});
