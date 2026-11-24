import { ClientsService, OPT_IN_SOURCE_BUSINESS } from './clients.service';

const NOW = new Date('2026-12-10T10:00:00Z');

function setup(existing: Record<string, unknown> | null = {}) {
  const prisma: any = {
    client: {
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'c1', ...data })),
      findFirst: jest.fn().mockResolvedValue(existing && { id: 'c1', organizationId: 'org-1', whatsappOptIn: false, whatsappOptedOutAt: null, ...existing }),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'c1', ...data })),
    },
  };
  return { prisma, service: new ClientsService(prisma) };
}

describe('ClientsService WhatsApp consent', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it('records when and how consent was given on a new client', async () => {
    const { service, prisma } = setup();
    await service.create('org-1', { name: 'Emeka', phone: '08031234567', whatsappOptIn: true } as any);
    expect(prisma.client.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ whatsappOptIn: true, whatsappOptInAt: NOW, whatsappOptInSource: OPT_IN_SOURCE_BUSINESS }),
    });
  });

  it('records no consent details for a client created without it', async () => {
    const { service, prisma } = setup();
    await service.create('org-1', { name: 'Emeka' } as any);
    const { data } = prisma.client.create.mock.calls[0][0];
    expect(data.whatsappOptInAt).toBeUndefined();
    expect(data.whatsappOptInSource).toBeUndefined();
  });

  it('stamps time and source when consent is switched on', async () => {
    const { service, prisma } = setup({ whatsappOptIn: false });
    await service.update('c1', 'org-1', { whatsappOptIn: true } as any);
    expect(prisma.client.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { whatsappOptIn: true, whatsappOptInAt: NOW, whatsappOptInSource: OPT_IN_SOURCE_BUSINESS },
    });
  });

  it('does not restamp consent on an unrelated edit of an already opted-in client', async () => {
    const { service, prisma } = setup({ whatsappOptIn: true });
    await service.update('c1', 'org-1', { name: 'Emeka O.', whatsappOptIn: true } as any);
    const { data } = prisma.client.update.mock.calls[0][0];
    expect(data).toEqual({ name: 'Emeka O.', whatsappOptIn: true });
  });

  it('can switch consent off', async () => {
    const { service, prisma } = setup({ whatsappOptIn: true });
    await service.update('c1', 'org-1', { whatsappOptIn: false } as any);
    expect(prisma.client.update.mock.calls[0][0].data).toEqual({ whatsappOptIn: false });
  });

  it('a customer who replied STOP cannot be opted back in by ticking the box', async () => {
    const { service, prisma } = setup({ whatsappOptIn: false, whatsappOptedOutAt: new Date('2026-12-01T00:00:00Z') });
    await service.update('c1', 'org-1', { name: 'Emeka O.', whatsappOptIn: true } as any);
    const { data } = prisma.client.update.mock.calls[0][0];
    expect(data).toEqual({ name: 'Emeka O.' }); // other edits still go through; consent is untouched
  });
});
