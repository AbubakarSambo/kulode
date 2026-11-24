import { Logger } from '@nestjs/common';
import { PaystackService } from './paystack.service';

const NOW = new Date('2026-12-10T10:00:00Z');

function setup(secretKey = 'sk_test_x') {
  const prisma: any = {
    invoice: { findMany: jest.fn().mockResolvedValue([]) },
    paymentInstallment: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const config: any = { get: (k: string) => (k === 'paystack.secretKey' ? secretKey : undefined) };
  const service: any = new PaystackService(config, prisma, {} as any, {} as any, {} as any);
  service.verifyTransaction = jest.fn();
  return { prisma, service };
}

describe('PaystackService.reconcilePendingPayments', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('only looks at open invoices and unpaid installments with a recent link', async () => {
    const { service, prisma } = setup();
    await service.reconcilePendingPayments(NOW);
    const since = new Date('2026-12-07T10:00:00Z');
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
          deletedAt: null,
          paystackReference: { not: null },
          paystackTokenGeneratedAt: { gte: since },
        },
        take: 100,
      }),
    );
    expect(prisma.paymentInstallment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isPaid: false, paystackTokenGeneratedAt: { gte: since } }) }),
    );
  });

  it('verifies each reference once and counts the ones that turned out paid', async () => {
    const { service, prisma } = setup();
    prisma.invoice.findMany.mockResolvedValue([{ paystackReference: 'ref-1' }, { paystackReference: 'ref-2' }]);
    prisma.paymentInstallment.findMany.mockResolvedValue([{ paystackReference: 'ref-2' }, { paystackReference: 'ref-3' }]);
    service.verifyTransaction.mockImplementation(async (ref: string) => ({ status: ref === 'ref-2' ? 'success' : 'abandoned', newlyReconciled: ref === 'ref-2', invoiceNumber: 'INV-1' }));

    const result = await service.reconcilePendingPayments(NOW);

    expect(service.verifyTransaction).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ checked: 3, recovered: 1 });
  });

  it('does not count a payment that was already on file as recovered', async () => {
    const { service, prisma } = setup();
    prisma.invoice.findMany.mockResolvedValue([{ paystackReference: 'ref-1' }, { paystackReference: 'ref-2' }]);
    service.verifyTransaction.mockImplementation(async (ref: string) => ({ status: 'success', newlyReconciled: ref === 'ref-2' }));
    const warn = jest.spyOn(Logger.prototype, 'warn');

    await expect(service.reconcilePendingPayments(NOW)).resolves.toEqual({ checked: 2, recovered: 1 });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('keeps going when one verification fails', async () => {
    const { service, prisma } = setup();
    prisma.invoice.findMany.mockResolvedValue([{ paystackReference: 'bad' }, { paystackReference: 'good' }]);
    service.verifyTransaction.mockImplementation(async (ref: string) => {
      if (ref === 'bad') throw new Error('Paystack 500');
      return { status: 'success', newlyReconciled: true };
    });
    await expect(service.reconcilePendingPayments(NOW)).resolves.toEqual({ checked: 2, recovered: 1 });
  });

  it('does nothing without a Paystack key (mock mode)', async () => {
    const { service, prisma } = setup('');
    await expect(service.reconcilePendingPayments(NOW)).resolves.toEqual({ checked: 0, recovered: 0 });
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });
});
