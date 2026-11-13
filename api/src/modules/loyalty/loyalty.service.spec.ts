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
  categoryCount?: number;
  existingDiscounts?: { id: string }[];
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
    customer: { updateMany: jest.fn().mockResolvedValue({ count: opts.alreadyMember ? 0 : 1 }) },
    loyaltyMessage: { create: jest.fn() },
    memberDiscount: { updateMany: jest.fn(), update: jest.fn(), create: jest.fn() },
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
    },
    loyaltyRewardRule: {
      findMany: jest.fn().mockResolvedValue(
        (opts.existingRules ?? []).map((r) => ({ ...r, name: r.id, thresholdAmount: 1, repeating: true, maxPerOrder: null, foodCost: 0, items: [] })),
      ),
    },
    menuItem: { count: jest.fn().mockResolvedValue(opts.menuItemCount ?? 1) },
    menuCategory: { count: jest.fn().mockResolvedValue(opts.categoryCount ?? 1) },
    memberDiscount: { findMany: jest.fn().mockResolvedValue(opts.existingDiscounts ?? []) },
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
    const { service, tx } = setup();
    const res = await service.enrol(ctx, { ...baseDto, customerId: 'c1' });
    expect(res.enrolled).toBe(true);
    const call = tx.customer.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: 'c1', organizationId: ORG, isMember: false });
    expect(call.data).toMatchObject({ isMember: true, enrolledById: 'w1', enrolSource: 'ORDER' });
    expect(call.data.messageConsentAt).toBeInstanceOf(Date);
  });

  it('enrolling twice is a no-op that keeps the first enroller', async () => {
    const { service, tx } = setup({ alreadyMember: true });
    expect((await service.enrol(ctx, { ...baseDto, customerId: 'c1' })).enrolled).toBe(false);
    expect(tx.loyaltyMessage.create).not.toHaveBeenCalled(); // no second welcome message
  });

  it('queues the welcome message for a newly enrolled member, in the same transaction', async () => {
    const { service, tx } = setup();
    await service.enrol(ctx, { ...baseDto, customerId: 'c1' });
    expect(tx.loyaltyMessage.create).toHaveBeenCalledWith({ data: { organizationId: ORG, customerId: 'c1', kind: 'WELCOME' } });
  });

  it('refuses when the programme is off', async () => {
    const { service } = setup({ enabled: false });
    await expect(service.enrol(ctx, { ...baseDto, customerId: 'c1' })).rejects.toMatchObject({ response: { code: 'LOYALTY_OFF' } });
  });

  it('refuses without the customer\'s message consent', async () => {
    const { service, tx } = setup();
    await expect(service.enrol(ctx, { ...baseDto, consent: false, customerId: 'c1' })).rejects.toMatchObject({
      response: { code: 'LOYALTY_CONSENT_REQUIRED' },
    });
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
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
    const { service, tx } = setup({ customer: { id: 'c1', name: '+2348031234569', phone: '+2348031234569', email: null, isMember: false } });
    await service.enrol(ctx, { ...baseDto, customerId: 'c1', name: ' Amaka Obi ' });
    expect(tx.customer.updateMany.mock.calls[0][0].data.name).toBe('Amaka Obi');
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

describe('LoyaltyService member discounts', () => {
  const eventSpace = { name: 'Event space', ratePct: 7.5, menuItemIds: ['m1'], categoryIds: [] as string[] };

  it('creates a discount with its items and categories (de-duplicated)', async () => {
    const { service, tx } = setup({ enabled: false });
    await service.updateSettings(ORG, { discounts: [{ ...eventSpace, menuItemIds: ['m1', 'm1'], categoryIds: ['c1', 'c1'] }] });
    expect(tx.memberDiscount.create).toHaveBeenCalledWith({
      data: { name: 'Event space', ratePct: 7.5, menuItemIds: ['m1'], categoryIds: ['c1'], isActive: true, organizationId: ORG },
    });
  });

  it('edits by id and deactivates the ones left out, never deleting', async () => {
    const { service, tx } = setup({ enabled: false, existingDiscounts: [{ id: 'd1' }, { id: 'd2' }] });
    await service.updateSettings(ORG, { discounts: [{ ...eventSpace, id: 'd1' }] });
    expect(tx.memberDiscount.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'd1' } }));
    expect(tx.memberDiscount.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['d2'] }, organizationId: ORG }, data: { isActive: false } });
  });

  it('needs at least one item or category', async () => {
    const { service } = setup({ enabled: false });
    await expect(service.updateSettings(ORG, { discounts: [{ ...eventSpace, menuItemIds: [] }] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses items or categories from another organization', async () => {
    await expect(setup({ enabled: false, menuItemCount: 0 }).service.updateSettings(ORG, { discounts: [eventSpace] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      setup({ enabled: false, categoryCount: 0 }).service.updateSettings(ORG, { discounts: [{ ...eventSpace, menuItemIds: [], categoryIds: ['c9'] }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to edit another organization\'s discount', async () => {
    const { service } = setup({ enabled: false, existingDiscounts: [{ id: 'mine' }] });
    await expect(service.updateSettings(ORG, { discounts: [{ ...eventSpace, id: 'theirs' }] })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('LoyaltyService undelivered messages', () => {
  const row = (over: object = {}) => ({
    id: 'm1',
    kind: 'REWARD_EARNED',
    customer_id: 'c1',
    name: 'Amaka',
    phone: '+2348031234569',
    last_error: null,
    created_at: new Date('2026-11-13T17:16:02Z'),
    delivery_error: 'This message was not delivered to maintain healthy ecosystem engagement.',
    reward_text: 'a free Nigerian Breakfast',
    ...over,
  });

  it('lists welcome and reward messages, with Meta\'s reason and what was earned', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw = jest.fn().mockResolvedValue([row(), row({ id: 'm2', kind: 'WELCOME', delivery_error: null, last_error: 'Meta says no', reward_text: null })]);
    const list = await service.undelivered(ORG);
    expect(list).toEqual([
      expect.objectContaining({ id: 'm1', kind: 'REWARD_EARNED', rewardText: 'a free Nigerian Breakfast', reason: 'This message was not delivered to maintain healthy ecosystem engagement.' }),
      expect.objectContaining({ id: 'm2', kind: 'WELCOME', rewardText: null, reason: 'Meta says no' }),
    ]);
  });

  it('falls back to a generic reason when there is none', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw = jest.fn().mockResolvedValue([row({ delivery_error: null, last_error: null })]);
    expect((await service.undelivered(ORG))[0].reason).toBe('Could not be delivered');
  });

  it('either kind can be marked followed up, scoped to the organization', async () => {
    const { service, prisma } = setup();
    prisma.loyaltyMessage = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    await service.resolveUndelivered(ORG, 'm1', 'u1');
    expect(prisma.loyaltyMessage.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'm1', organizationId: ORG, resolvedAt: null } }));
    prisma.loyaltyMessage.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.resolveUndelivered(ORG, 'other-org-msg', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only a welcome can be sent again; a reward message cannot', async () => {
    const { service, prisma } = setup();
    prisma.loyaltyMessage = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    await service.retryUndelivered(ORG, 'm2');
    expect(prisma.loyaltyMessage.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'm2', organizationId: ORG, kind: 'WELCOME' }) }));
    prisma.loyaltyMessage.updateMany.mockResolvedValue({ count: 0 }); // a reward message matches nothing
    await expect(service.retryUndelivered(ORG, 'reward-msg')).rejects.toBeInstanceOf(NotFoundException);
  });
});

