import { DemoSeedService } from './demo-seed.service';

describe('DemoSeedService wipe', () => {
  it('also clears the loyalty set-up and switches loyalty off, after customers (so their rewards go first)', async () => {
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
      menuItem: del('menuItem'),
      menuCategory: del('menuCategory'),
      inventoryItem: del('inventoryItem'),
      restaurantTable: del('restaurantTable'),
      orderType: del('orderType'),
      paymentType: del('paymentType'),
      organization: { update: jest.fn(async () => void order.push('organization.update')) },
    };
    await (new DemoSeedService(prisma) as any).wipe('demo-org');

    // rules reference rewards (restricted), and rewards go with their customers: customers first
    expect(order.indexOf('customer')).toBeLessThan(order.indexOf('loyaltyRewardRule'));
    for (const t of ['loyaltyRewardRule', 'memberDiscount', 'coverageSnapshot']) {
      expect(prisma[t].deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'demo-org' } });
    }
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'demo-org' },
      data: { loyaltyEnabled: false, loyaltyStartAt: null, loyaltyExpiryDays: 90 },
    });
  });
});
