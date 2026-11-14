import { SupermarketSeedService } from './supermarket-seed.service';
import { SUPERMARKET_HELD_TARGET, SUPERMARKET_ORG_SLUG, PRODUCTS } from './supermarket.constants';

function wipePrisma() {
  const order: string[] = [];
  const del = (name: string) => ({ deleteMany: jest.fn(async () => void order.push(name)) });
  const prisma: any = {
    walletTransaction: del('walletTransaction'),
    moniepointUnreconciledTransfer: del('moniepointUnreconciledTransfer'),
    stockMovement: del('stockMovement'),
    payment: del('payment'),
    whatsappMessage: del('whatsappMessage'),
    sheetSyncQueueEntry: del('sheetSyncQueueEntry'),
    order: del('order'),
    shift: del('shift'),
    customer: del('customer'),
    loyaltyRewardRule: del('loyaltyRewardRule'),
    memberDiscount: del('memberDiscount'),
    coverageSnapshot: del('coverageSnapshot'),
    heldSale: del('heldSale'),
    inventoryItem: del('inventoryItem'),
    orderType: del('orderType'),
    paymentType: del('paymentType'),
    organization: { update: jest.fn(async () => void order.push('organization.update')) },
  };
  return { prisma, order };
}

describe('SupermarketSeedService wipe', () => {
  it('clears the loyalty set-up and switches loyalty off, after customers (so their rewards go first)', async () => {
    const { prisma, order } = wipePrisma();
    await (new SupermarketSeedService(prisma) as any).wipe('demo-org');

    expect(order.indexOf('customer')).toBeLessThan(order.indexOf('loyaltyRewardRule'));
    for (const t of ['loyaltyRewardRule', 'memberDiscount', 'coverageSnapshot']) {
      expect(prisma[t].deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'demo-org' } });
    }
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'demo-org' },
      data: { loyaltyEnabled: false, loyaltyStartAt: null, loyaltyExpiryDays: 90 },
    });
  });

  it('removes parked carts too, so a rebuild never leaves carts pointing at deleted products', async () => {
    const { prisma } = wipePrisma();
    await (new SupermarketSeedService(prisma) as any).wipe('demo-org');
    expect(prisma.heldSale.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'demo-org' } });
  });

  it('only ever touches its own slug, and refuses a demo slug that is no longer a test account', async () => {
    const prisma: any = {
      organization: { findUnique: jest.fn().mockResolvedValue({ id: 'x', slug: SUPERMARKET_ORG_SLUG, isTestAccount: false }) },
    };
    const service = new SupermarketSeedService(prisma);
    await expect(service.reset()).rejects.toThrow(/not a test account/);
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({ where: { slug: SUPERMARKET_ORG_SLUG } });
  });
});

describe('SupermarketSeedService held carts', () => {
  const staff = { adminId: 'a', managerId: 'm', cashierIds: ['c1', 'c2', 'c3'] };
  const itemId = new Map(PRODUCTS.map((p, i) => [p.name, `inv-${i}`]));

  it('parks a couple of carts at different lanes while the shop is open', async () => {
    const prisma: any = { heldSale: { createMany: jest.fn() } };
    const now = new Date('2026-11-14T11:00:00Z'); // 12:00 Lagos
    await (new SupermarketSeedService(prisma) as any).seedHeldSales('org', staff, itemId, now);

    const { data } = prisma.heldSale.createMany.mock.calls[0][0];
    expect(data).toHaveLength(SUPERMARKET_HELD_TARGET);
    expect(new Set(data.map((r: any) => r.heldById)).size).toBe(SUPERMARKET_HELD_TARGET);
    for (const row of data) {
      expect(row.organizationId).toBe('org');
      expect(row.items.length).toBeGreaterThanOrEqual(1);
      for (const line of row.items) expect(line.inventoryItemId).toMatch(/^inv-/);
      expect(row.createdAt.getTime()).toBeLessThan(now.getTime());
    }
  });

  it('parks nothing overnight, when no customer would be mid-shop', async () => {
    const prisma: any = { heldSale: { createMany: jest.fn() } };
    await (new SupermarketSeedService(prisma) as any).seedHeldSales('org', staff, itemId, new Date('2026-11-14T02:00:00Z'));
    expect(prisma.heldSale.createMany).not.toHaveBeenCalled();
  });
});
