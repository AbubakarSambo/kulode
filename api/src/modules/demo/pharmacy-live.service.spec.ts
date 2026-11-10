import { PharmacyLiveService } from './pharmacy-live.service';
import { PHARMACY_ORG_SLUG } from './pharmacy.constants';
import { DEMO_ORG_SLUG } from './demo.constants';

function createService(org: { slug: string; isTestAccount: boolean } | null, populating = false) {
  const prisma = {
    organization: { findUnique: jest.fn().mockResolvedValue(org) },
    order: { findMany: jest.fn(), count: jest.fn(), deleteMany: jest.fn() },
    shift: { findFirst: jest.fn() },
  };
  const ordersService = { create: jest.fn(), closeWithPayment: jest.fn(), cancel: jest.fn() };
  const walletService = { topUp: jest.fn() };
  const seedService = { isPopulating: jest.fn().mockReturnValue(populating), loadStaff: jest.fn() };
  const service = new PharmacyLiveService(prisma as any, ordersService as any, walletService as any, seedService as any);
  return { service, prisma, ordersService, seedService };
}

describe('PharmacyLiveService guards', () => {
  it('refuses a real business even if its id is in DEMO_ORG_IDS', async () => {
    const { service, ordersService, seedService } = createService({ slug: 'some-real-pharmacy', isTestAccount: false });
    await service.tick('real-org');
    await service.prune('real-org');
    expect(seedService.loadStaff).not.toHaveBeenCalled();
    expect(ordersService.create).not.toHaveBeenCalled();
  });

  it('refuses the restaurant demo — the two demos only act on their own org', async () => {
    const { service, ordersService, seedService } = createService({ slug: DEMO_ORG_SLUG, isTestAccount: true });
    await service.tick('restaurant-demo-org');
    expect(seedService.loadStaff).not.toHaveBeenCalled();
    expect(ordersService.create).not.toHaveBeenCalled();
  });

  it('refuses the demo slug once it is no longer flagged as a test account', async () => {
    const { service, prisma } = createService({ slug: PHARMACY_ORG_SLUG, isTestAccount: false });
    await service.prune('demo-org');
    expect(prisma.order.deleteMany).not.toHaveBeenCalled();
  });

  it('does nothing while a reset is rebuilding the data', async () => {
    const { service, prisma } = createService({ slug: PHARMACY_ORG_SLUG, isTestAccount: true }, true);
    await service.tick('demo-org');
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('accepts the demo pharmacy', async () => {
    const { service } = createService({ slug: PHARMACY_ORG_SLUG, isTestAccount: true });
    await expect(service.isDemoOrg('demo-org')).resolves.toBe(true);
  });
});
