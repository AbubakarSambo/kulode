import { ConflictException, BadRequestException } from '@nestjs/common';
import { PhoneCreditSource } from '@prisma/client';
import { PhoneCaptureService } from './phone-capture.service';

const ORG = 'org-1';
const ctx = { organizationId: ORG, actorId: 'w1', source: PhoneCreditSource.CUSTOMER_FORM };

function setup(opts: { holder?: { id: string; name: string } | null; existingPhone?: string | null } = {}) {
  const creditCreateMany = jest.fn().mockResolvedValue({ count: 1 });
  const tx: any = {
    customer: {
      create: jest.fn(async ({ data }: any) => ({ id: 'c-new', ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: 'c1', ...data })),
    },
    phoneCredit: { createMany: creditCreateMany },
    $queryRaw: jest.fn().mockResolvedValue(opts.holder ? [opts.holder] : []),
  };
  const prisma: any = {
    ...tx,
    organization: { findUnique: jest.fn().mockResolvedValue({ phoneCountry: 'NG', phoneBlocklist: [] }) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'w-collector' }) },
    customer: {
      ...tx.customer,
      findFirst: jest.fn().mockResolvedValue({ id: 'c1', phone: opts.existingPhone ?? null }),
    },
    $queryRaw: tx.$queryRaw,
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  return { prisma, tx, creditCreateMany, service: new PhoneCaptureService(prisma) };
}

describe('PhoneCaptureService', () => {
  it('P1: a new customer with a valid number credits the staff member, saved normalised', async () => {
    const { service, tx, creditCreateMany } = setup();
    const res = await service.createCustomer(ctx, { name: 'Tunde', phone: '0803 123 4569' });
    expect(tx.customer.create.mock.calls[0][0].data).toMatchObject({ phone: '+2348031234569', createdById: 'w1' });
    expect(creditCreateMany.mock.calls[0][0].data[0]).toMatchObject({ userId: 'w1', enteredById: 'w1', phone: '+2348031234569' });
    expect(res.credited).toBe(true);
  });

  it('a new customer with no number earns nothing', async () => {
    const { service, creditCreateMany } = setup();
    const res = await service.createCustomer(ctx, { name: 'Tunde' });
    expect(creditCreateMany).not.toHaveBeenCalled();
    expect(res.credited).toBe(false);
  });

  it('existing customer with no number gets one: credit', async () => {
    const { service, creditCreateMany } = setup({ existingPhone: null });
    expect((await service.setPhone(ctx, 'c1', '08031234569')).credited).toBe(true);
    expect(creditCreateMany).toHaveBeenCalledTimes(1);
  });

  it('a customer whose stored number is a junk placeholder counts as having no number', async () => {
    const { service } = setup({ existingPhone: '090xxxx' });
    expect((await service.setPhone(ctx, 'c1', '08031234569')).credited).toBe(true);
  });

  it('P2: correcting an existing valid number earns no credit', async () => {
    const { service, creditCreateMany, tx } = setup({ existingPhone: '+234 803 111 2223' });
    expect((await service.setPhone(ctx, 'c1', '08031234569')).credited).toBe(false);
    expect(tx.customer.update).toHaveBeenCalled();
    expect(creditCreateMany).not.toHaveBeenCalled();
  });

  it('P3: a number held by another customer is refused with that customer, no credit', async () => {
    const { service, creditCreateMany } = setup({ holder: { id: 'c9', name: 'Ada' } });
    await expect(service.createCustomer(ctx, { name: 'Tunde', phone: '08031234569' })).rejects.toThrow(ConflictException);
    await expect(service.setPhone(ctx, 'c1', '08031234569')).rejects.toMatchObject({
      response: { code: 'PHONE_EXISTS', errors: { existingCustomerId: 'c9', existingCustomerName: 'Ada' } },
    });
    expect(creditCreateMany).not.toHaveBeenCalled();
  });

  it('P4: made-up numbers are blocked before anything is saved', async () => {
    const { service, tx } = setup();
    await expect(service.createCustomer(ctx, { name: 'T', phone: '08000000000' })).rejects.toThrow(BadRequestException);
    await expect(service.createCustomer(ctx, { name: 'T', phone: '08012345678' })).rejects.toThrow(BadRequestException);
    expect(tx.customer.create).not.toHaveBeenCalled();
  });

  it('P5: quick add credits the Collected by staff member, not the supervisor', async () => {
    const { service, creditCreateMany } = setup();
    await service.quickAdd({ ...ctx, actorId: 'sup1', source: PhoneCreditSource.QUICK_ADD }, {
      name: 'Tunde',
      phone: '08031234569',
      collectedById: 'w-collector',
    });
    expect(creditCreateMany.mock.calls[0][0].data[0]).toMatchObject({ userId: 'w-collector', enteredById: 'sup1', source: 'QUICK_ADD' });
  });

  it('quick add refuses a collector who is not active staff of the org', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.quickAdd(ctx, { name: 'T', phone: '08031234569', collectedById: 'x' })).rejects.toThrow(BadRequestException);
  });

  it('P6: an offline capture keeps its original time; a wildly wrong device clock is refused', async () => {
    const { service, creditCreateMany } = setup();
    const when = new Date(Date.now() - 3 * 3600_000);
    await service.createCustomer({ ...ctx, capturedAt: when }, { name: 'T', phone: '08031234569' });
    expect(creditCreateMany.mock.calls[0][0].data[0].capturedAt).toEqual(when);

    await expect(
      service.createCustomer({ ...ctx, capturedAt: new Date(Date.now() - 30 * 86_400_000) }, { name: 'T', phone: '08031234560' }),
    ).rejects.toThrow('capturedAt');
    await expect(
      service.createCustomer({ ...ctx, capturedAt: new Date(Date.now() + 3600_000) }, { name: 'T', phone: '08031234561' }),
    ).rejects.toThrow('capturedAt');
  });

  it('a second credit for the same customer is silently ignored (one credit per customer, ever)', async () => {
    const { service, creditCreateMany } = setup({ existingPhone: null });
    creditCreateMany.mockResolvedValue({ count: 0 });
    expect((await service.setPhone(ctx, 'c1', '08031234569')).credited).toBe(false);
  });
});
