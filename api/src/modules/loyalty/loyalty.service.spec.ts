import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PhoneCreditSource } from '@prisma/client';
import { LoyaltyService } from './loyalty.service';

const ORG = 'org-1';
const ctx = { organizationId: ORG, actorId: 'w1' };

interface Opts {
  enabled?: boolean;
  posMode?: string;
  startAt?: Date | null;
  customer?: Record<string, unknown> | null;
  alreadyMember?: boolean;
  existingRules?: { id: string; isActive: boolean }[];
  menuItemCount?: number;
}

function setup(opts: Opts = {}) {
  const customer = opts.customer === undefined
    ? { id: 'c1', name: 'Amaka Obi', phone: '+2348031234569', email: null, isMember: !!opts.alreadyMember }
    : opts.customer;
  const tx: any = {
    organization: { update: jest.fn().mockResolvedValue({}) },
    loyaltyRewardRule: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(async ({ where }: any) => ({ id: where.id })),
      create: jest.fn(async () => ({ id: 'r-new' })),
    },
    loyaltyRewardRuleItem: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
  const prisma: any = {
    organization: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        loyaltyEnabled: opts.enabled ?? true,
        loyaltyStartAt: opts.startAt ?? null,
        loyaltyExpiryDays: 90,
        posMode: opts.posMode ?? 'RESTAURANT',
        phoneCountry: 'NG',
        phoneBlocklist: [],
      }),
    },
    customer: {
      findFirst: jest.fn().mockResolvedValue(customer),
      findFirstOrThrow: jest.fn().mockImplementation(async () => customer),
      updateMany: jest.fn().mockResolvedValue({ count: opts.alreadyMember ? 0 : 1 }),
    },
    loyaltyRewardRule: {
      findMany: jest.fn().mockResolvedValue(
        (opts.existingRules ?? []).map((r) => ({ ...r, name: r.id, thresholdAmount: 1, repeating: true, maxPerOrder: null, foodCost: 0, items: [] })),
      ),
    },
    menuItem: { count: jest.fn().mockResolvedValue(opts.menuItemCount ?? 1) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const phoneCapture: any = {
    capture: jest.fn().mockResolvedValue({ customer: { id: 'c-new', name: '+2348031234569', phone: '+2348031234569' }, created: true, credited: true }),
  };
  return { prisma, tx, phoneCapture, service: new LoyaltyService(prisma, phoneCapture) };
}

const baseDto = { consent: true, source: 'ORDER' as const };
const rule = { name: 'Meal Reward', thresholdAmount: 100000, repeating: true, menuItemIds: ['m1'] };

describe('LoyaltyService.enrol', () => {
  it('upgrades an existing customer to a member, recording who, where and consent', async () => {
    const { service, prisma } = setup();
    const res = await service.enrol(ctx, { ...baseDto, customerId: 'c1' });
    expect(res.enrolled).toBe(true);
    const call = prisma.customer.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: 'c1', organizationId: ORG, isMember: false });
    expect(call.data).toMatchObject({ isMember: true, enrolledById: 'w1', enrolSource: 'ORDER' });
    expect(call.data.messageConsentAt).toBeInstanceOf(Date);
  });

  it('enrolling twice is a no-op that keeps the first enroller', async () => {
    const { service } = setup({ alreadyMember: true });
    expect((await service.enrol(ctx, { ...baseDto, customerId: 'c1' })).enrolled).toBe(false);
  });

  it('refuses when the programme is off', async () => {
    const { service } = setup({ enabled: false });
    await expect(service.enrol(ctx, { ...baseDto, customerId: 'c1' })).rejects.toMatchObject({ response: { code: 'LOYALTY_OFF' } });
  });

  it('refuses without the customer\'s message consent', async () => {
    const { service, prisma } = setup();
    await expect(service.enrol(ctx, { ...baseDto, consent: false, customerId: 'c1' })).rejects.toMatchObject({
      response: { code: 'LOYALTY_CONSENT_REQUIRED' },
    });
    expect(prisma.customer.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a customer whose stored number is a junk placeholder', async () => {
    const { service } = setup({ customer: { id: 'c1', name: 'Amaka', phone: '090xxxx', email: null, isMember: false } });
    await expect(service.enrol(ctx, { ...baseDto, customerId: 'c1' })).rejects.toMatchObject({ response: { code: 'PHONE_INVALID' } });
  });

  it('refuses a customer with no number', async () => {
    const { service } = setup({ customer: { id: 'c1', name: 'Amaka', phone: null, email: null, isMember: false } });
    await expect(service.enrol(ctx, { ...baseDto, customerId: 'c1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('needs a real name — a number standing in as the name does not count', async () => {
    const { service } = setup({ customer: { id: 'c1', name: '+2348031234569', phone: '+2348031234569', email: null, isMember: false } });
    await expect(service.enrol(ctx, { ...baseDto, customerId: 'c1' })).rejects.toMatchObject({ response: { code: 'LOYALTY_NAME_REQUIRED' } });
  });

  it('a typed name replaces the number-as-name placeholder', async () => {
    const { service, prisma } = setup({ customer: { id: 'c1', name: '+2348031234569', phone: '+2348031234569', email: null, isMember: false } });
    await service.enrol(ctx, { ...baseDto, customerId: 'c1', name: ' Amaka Obi ' });
    expect(prisma.customer.updateMany.mock.calls[0][0].data.name).toBe('Amaka Obi');
  });

  it('a new number goes through phone capture (so it finds an existing holder and credits the drive)', async () => {
    const { service, phoneCapture } = setup();
    const res = await service.enrol(ctx, { ...baseDto, source: 'PAY', phone: '08031234569', name: 'Amaka Obi' });
    expect(phoneCapture.capture).toHaveBeenCalledTimes(1);
    expect(phoneCapture.capture.mock.calls[0][0]).toMatchObject({ source: PhoneCreditSource.PAY, actorId: 'w1' });
    expect(res.phoneCredited).toBe(true);
  });

  it('does not re-capture a number the customer already has', async () => {
    const { service, phoneCapture } = setup();
    await service.enrol(ctx, { ...baseDto, customerId: 'c1', phone: '08031234569' });
    expect(phoneCapture.capture).not.toHaveBeenCalled();
  });

  it('404s for a customer from another organization', async () => {
    const { service } = setup({ customer: null });
    await expect(service.enrol(ctx, { ...baseDto, customerId: 'other' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('LoyaltyService.updateSettings', () => {
  it('refuses to switch on for a retail organization', async () => {
    const { service } = setup({ posMode: 'RETAIL', enabled: false });
    await expect(service.updateSettings(ORG, { enabled: true, rules: [rule] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to switch on with no reward', async () => {
    const { service } = setup({ enabled: false });
    await expect(service.updateSettings(ORG, { enabled: true })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses reward items that are not on this organization\'s menu', async () => {
    const { service } = setup({ enabled: false, menuItemCount: 0 });
    await expect(service.updateSettings(ORG, { enabled: true, rules: [rule] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to edit another organization\'s rule', async () => {
    const { service } = setup({ existingRules: [{ id: 'mine', isActive: true }] });
    await expect(service.updateSettings(ORG, { rules: [{ ...rule, id: 'theirs' }] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stamps the start date the first time it goes live, never afterwards', async () => {
    const first = setup({ enabled: false });
    await first.service.updateSettings(ORG, { enabled: true, rules: [rule] });
    expect(first.tx.organization.update.mock.calls[0][0].data.loyaltyStartAt).toBeInstanceOf(Date);

    const again = setup({ enabled: true, startAt: new Date('2026-11-13'), existingRules: [{ id: 'a', isActive: true }] });
    await again.service.updateSettings(ORG, { expiryDays: 60 });
    expect(again.tx.organization.update.mock.calls[0][0].data).not.toHaveProperty('loyaltyStartAt');
  });

  it('deactivates rules left out of the list instead of deleting them', async () => {
    const { service, tx } = setup({ existingRules: [{ id: 'a', isActive: true }, { id: 'b', isActive: true }] });
    await service.updateSettings(ORG, { rules: [{ ...rule, id: 'a' }] });
    expect(tx.loyaltyRewardRule.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ['b'] } }, data: { isActive: false } });
    expect(tx.loyaltyRewardRule.update).toHaveBeenCalledTimes(1);
  });

  it('creates new rules and replaces their item list', async () => {
    const { service, tx } = setup({ menuItemCount: 2 });
    await service.updateSettings(ORG, { rules: [{ ...rule, menuItemIds: ['m1', 'm1', 'm2'] }] });
    expect(tx.loyaltyRewardRule.create).toHaveBeenCalledTimes(1);
    expect(tx.loyaltyRewardRuleItem.createMany.mock.calls[0][0].data).toEqual([
      { ruleId: 'r-new', menuItemId: 'm1' },
      { ruleId: 'r-new', menuItemId: 'm2' },
    ]);
  });
});

describe('LoyaltyService.getSettings', () => {
  const rules = [
    { id: 'r1', name: 'Meal', thresholdAmount: 100000, repeating: true, maxPerOrder: 1, foodCost: 2700, isActive: true, items: [{ menuItem: { id: 'm1', name: 'Jollof' } }] },
  ];
  it('hides the food cost from non-admins', async () => {
    const { service, prisma } = setup();
    prisma.loyaltyRewardRule.findMany.mockResolvedValue(rules);
    const staff = await service.getSettings(ORG, false);
    expect(staff.rules[0]).not.toHaveProperty('foodCost');
    expect((await service.getSettings(ORG, true)).rules[0]).toMatchObject({ foodCost: 2700 });
  });

  it('reports a retail organization as unavailable', async () => {
    const { service } = setup({ posMode: 'RETAIL' });
    expect((await service.getSettings(ORG, true)).available).toBe(false);
  });
});
