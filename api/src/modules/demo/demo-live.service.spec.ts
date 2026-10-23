import { DemoLiveService } from './demo-live.service';
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
  const service = new DemoLiveService(prisma as any, ordersService as any, walletService as any, seedService as any);
  return { service, prisma, ordersService, seedService };
}

describe('DemoLiveService guards', () => {
  it('refuses a real restaurant even if its id is in DEMO_ORG_IDS', async () => {
    const { service, ordersService, seedService } = createService({ slug: 'living-room', isTestAccount: false });
    await service.tick('real-org');
    await service.prune('real-org');
    expect(seedService.loadStaff).not.toHaveBeenCalled();
    expect(ordersService.create).not.toHaveBeenCalled();
  });

  it('refuses the demo slug once it is no longer flagged as a test account', async () => {
    const { service, prisma } = createService({ slug: DEMO_ORG_SLUG, isTestAccount: false });
    await service.prune('demo-org');
    expect(prisma.order.deleteMany).not.toHaveBeenCalled();
  });

  it('does nothing while a reset is rebuilding the data', async () => {
    const { service, prisma } = createService({ slug: DEMO_ORG_SLUG, isTestAccount: true }, true);
    await service.tick('demo-org');
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('accepts the demo org', async () => {
    const { service } = createService({ slug: DEMO_ORG_SLUG, isTestAccount: true });
    await expect(service.isDemoOrg('demo-org')).resolves.toBe(true);
  });
});
