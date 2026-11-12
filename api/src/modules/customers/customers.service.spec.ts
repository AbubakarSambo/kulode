import { CustomersService } from './customers.service';

describe('CustomersService.update', () => {
  const setup = (storedPhone: string | null) => {
    const prisma: any = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'c1', phone: storedPhone }),
        update: jest.fn(async ({ data }: any) => ({ id: 'c1', ...data })),
      },
    };
    const phoneCapture: any = { setPhone: jest.fn().mockResolvedValue({ phone: null, credited: false }) };
    return { prisma, phoneCapture, service: new CustomersService(prisma, phoneCapture) };
  };

  it('does not revalidate a number the form sent back unchanged (legacy placeholders stay editable)', async () => {
    const { service, phoneCapture, prisma } = setup('090xxxx');
    await service.update('c1', 'org-1', 'u1', { name: 'New name', phone: '090xxxx' });
    expect(phoneCapture.setPhone).not.toHaveBeenCalled();
    expect(prisma.customer.update.mock.calls[0][0].data).toEqual({ name: 'New name' });
  });

  it('routes a changed number through phone capture and never writes it directly', async () => {
    const { service, phoneCapture, prisma } = setup(null);
    await service.update('c1', 'org-1', 'u1', { name: 'N', phone: '08031234569' });
    expect(phoneCapture.setPhone).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org-1', actorId: 'u1' }), 'c1', '08031234569');
    expect(prisma.customer.update.mock.calls[0][0].data).not.toHaveProperty('phone');
  });
});
