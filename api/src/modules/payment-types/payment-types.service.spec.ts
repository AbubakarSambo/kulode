import { PaymentTypesService } from './payment-types.service';

const ORG = 'org-1';

describe('PaymentTypesService', () => {
  const setup = () => {
    const prisma: any = {
      paymentType: { findFirst: jest.fn(), update: jest.fn((args) => args), create: jest.fn((args) => args) },
      payment: { updateMany: jest.fn((args) => args) },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };
    return { prisma, service: new PaymentTypesService(prisma) };
  };

  it('creates a type as non-complimentary unless asked', async () => {
    const { prisma, service } = setup();
    prisma.paymentType.findFirst.mockResolvedValue(null);
    await service.create(ORG, { name: 'Cheque' });
    expect(prisma.paymentType.create.mock.calls[0][0].data.isComplimentary).toBe(false);
    await service.create(ORG, { name: 'House', isComplimentary: true });
    expect(prisma.paymentType.create.mock.calls[1][0].data.isComplimentary).toBe(true);
  });

  it('flags a type complimentary without touching payments', async () => {
    const { prisma, service } = setup();
    prisma.paymentType.findFirst.mockResolvedValue({ id: 't1', name: 'LR Complimentary' });
    await service.update(ORG, 't1', { isComplimentary: true });
    expect(prisma.paymentType.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { isComplimentary: true } });
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it("carries a type's payments along when it is renamed, so they keep matching it", async () => {
    const { prisma, service } = setup();
    prisma.paymentType.findFirst
      .mockResolvedValueOnce({ id: 't1', name: 'LR Complimentary' }) // the type being edited
      .mockResolvedValueOnce(null); // name availability check
    await service.update(ORG, 't1', { name: 'Comp (LR)' });
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, paymentMethod: 'LR Complimentary' },
      data: { paymentMethod: 'Comp (LR)' },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
