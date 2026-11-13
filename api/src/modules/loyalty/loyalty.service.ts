import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LoyaltyEnrolSource, PhoneCreditSource, Prisma } from '@prisma/client';
import { normalisePhone, PHONE_REJECTION_MESSAGES } from '../../common';
import { PrismaService } from '../prisma/prisma.service';
import { PhoneCaptureService } from '../customers/phone-capture.service';
import { EnrolMemberDto, MemberDiscountDto, RewardRuleDto, UpdateLoyaltySettingsDto } from './dto';
import { toCsv } from '../collection/collection.csv';
import { toKobo, toNextReward } from './loyalty.earn';

const toNumber = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));

// A customer saved from just a number has that number as their name until someone fills it in.
const looksLikeNumber = (name: string) => /^[+\d\s\-().]+$/.test(name.trim());

const CREDIT_SOURCE: Record<EnrolMemberDtoSource, PhoneCreditSource> = {
  ORDER: PhoneCreditSource.ORDER,
  PAY: PhoneCreditSource.PAY,
  QUICK_ADD: PhoneCreditSource.QUICK_ADD,
  CUSTOMER_FORM: PhoneCreditSource.CUSTOMER_FORM,
};
type EnrolMemberDtoSource = EnrolMemberDto['source'];

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly phoneCapture: PhoneCaptureService,
  ) {}

  /** Programme settings plus its reward rules. Food cost is the business's cost, so admin-only. */
  async getSettings(organizationId: string, includeCosts: boolean) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { loyaltyEnabled: true, loyaltyStartAt: true, loyaltyExpiryDays: true, posMode: true },
    });
    const rules = await this.prisma.loyaltyRewardRule.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { items: { include: { menuItem: { select: { id: true, name: true } } } } },
    });
    const discounts = await this.prisma.memberDiscount.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
    return {
      discounts: discounts.map((d) => ({
        id: d.id,
        name: d.name,
        ratePct: toNumber(d.ratePct),
        menuItemIds: d.menuItemIds,
        categoryIds: d.categoryIds,
        isActive: d.isActive,
      })),
      enabled: org.loyaltyEnabled,
      // Loyalty is built around restaurant orders; a retail org can't switch it on.
      available: org.posMode === 'RESTAURANT',
      startAt: org.loyaltyStartAt,
      expiryDays: org.loyaltyExpiryDays,
      rules: rules.map((r) => ({
        id: r.id,
        name: r.name,
        thresholdAmount: toNumber(r.thresholdAmount),
        repeating: r.repeating,
        maxPerOrder: r.maxPerOrder,
        ...(includeCosts ? { foodCost: toNumber(r.foodCost) } : {}),
        isActive: r.isActive,
        items: r.items.map((i) => ({ id: i.menuItem.id, name: i.menuItem.name })).sort((a, b) => a.name.localeCompare(b.name)),
      })),
    };
  }

  async updateSettings(organizationId: string, dto: UpdateLoyaltySettingsDto) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { loyaltyEnabled: true, loyaltyStartAt: true, posMode: true },
    });
    const enabled = dto.enabled ?? org.loyaltyEnabled;
    if (enabled && org.posMode !== 'RESTAURANT') {
      throw new BadRequestException('Loyalty is only available for restaurant organizations');
    }

    const existing = await this.prisma.loyaltyRewardRule.findMany({ where: { organizationId }, select: { id: true, isActive: true } });
    if (dto.rules) await this.validateRules(organizationId, dto.rules, existing.map((r) => r.id));
    const existingDiscounts = await this.prisma.memberDiscount.findMany({ where: { organizationId }, select: { id: true } });
    if (dto.discounts) await this.validateDiscounts(organizationId, dto.discounts, existingDiscounts.map((d) => d.id));

    const activeAfter = dto.rules ? dto.rules.filter((r) => r.isActive !== false).length : existing.filter((r) => r.isActive).length;
    if (enabled && activeAfter === 0) {
      throw new BadRequestException('Add at least one reward before switching loyalty on');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: {
          ...(dto.enabled !== undefined && { loyaltyEnabled: dto.enabled }),
          ...(dto.expiryDays !== undefined && { loyaltyExpiryDays: dto.expiryDays }),
          // Spend counts from the first time the programme goes live — there is no back-credit.
          ...(enabled && !org.loyaltyStartAt && { loyaltyStartAt: new Date() }),
        },
      });

      if (dto.discounts) {
        const keepDiscounts = new Set(dto.discounts.filter((d) => d.id).map((d) => d.id as string));
        const droppedDiscounts = existingDiscounts.filter((d) => !keepDiscounts.has(d.id)).map((d) => d.id);
        // Left out = switched off, not deleted.
        if (droppedDiscounts.length) await tx.memberDiscount.updateMany({ where: { id: { in: droppedDiscounts }, organizationId }, data: { isActive: false } });
        for (const d of dto.discounts) {
          const data = {
            name: d.name.trim(),
            ratePct: d.ratePct,
            menuItemIds: [...new Set(d.menuItemIds)],
            categoryIds: [...new Set(d.categoryIds)],
            isActive: d.isActive ?? true,
          };
          if (d.id) await tx.memberDiscount.update({ where: { id: d.id }, data });
          else await tx.memberDiscount.create({ data: { ...data, organizationId } });
        }
      }

      if (!dto.rules) return;
      const keep = new Set(dto.rules.filter((r) => r.id).map((r) => r.id as string));
      // Rules left out are switched off, not deleted: rewards already earned from them keep pointing at them.
      const dropped = existing.filter((r) => !keep.has(r.id)).map((r) => r.id);
      if (dropped.length) await tx.loyaltyRewardRule.updateMany({ where: { id: { in: dropped }, organizationId }, data: { isActive: false } });

      for (const [index, rule] of dto.rules.entries()) {
        const data = {
          name: rule.name.trim(),
          thresholdAmount: rule.thresholdAmount,
          repeating: rule.repeating,
          maxPerOrder: rule.maxPerOrder ?? null,
          foodCost: rule.foodCost ?? 0,
          isActive: rule.isActive ?? true,
          sortOrder: index,
        };
        const saved = rule.id
          ? await tx.loyaltyRewardRule.update({ where: { id: rule.id }, data })
          : await tx.loyaltyRewardRule.create({ data: { ...data, organizationId } });
        await tx.loyaltyRewardRuleItem.deleteMany({ where: { ruleId: saved.id } });
        await tx.loyaltyRewardRuleItem.createMany({ data: [...new Set(rule.menuItemIds)].map((menuItemId) => ({ ruleId: saved.id, menuItemId })) });
      }
    });

    return this.getSettings(organizationId, true);
  }

  private async validateDiscounts(organizationId: string, discounts: MemberDiscountDto[], ownIds: string[]) {
    for (const d of discounts) {
      if (d.id && !ownIds.includes(d.id)) throw new NotFoundException('Member discount not found');
      if (d.menuItemIds.length === 0 && d.categoryIds.length === 0) {
        throw new BadRequestException(`"${d.name}" needs at least one item or category`);
      }
    }
    const itemIds = [...new Set(discounts.flatMap((d) => d.menuItemIds))];
    const categoryIds = [...new Set(discounts.flatMap((d) => d.categoryIds))];
    const [items, categories] = await Promise.all([
      itemIds.length ? this.prisma.menuItem.count({ where: { id: { in: itemIds }, organizationId } }) : Promise.resolve(0),
      categoryIds.length ? this.prisma.menuCategory.count({ where: { id: { in: categoryIds }, organizationId } }) : Promise.resolve(0),
    ]);
    if (items !== itemIds.length) throw new BadRequestException('A discount item is not on this organization\'s menu');
    if (categories !== categoryIds.length) throw new BadRequestException('A discount category is not one of this organization\'s categories');
  }

  private async validateRules(organizationId: string, rules: RewardRuleDto[], ownRuleIds: string[]) {
    for (const rule of rules) {
      if (rule.id && !ownRuleIds.includes(rule.id)) throw new NotFoundException('Reward rule not found');
    }
    const itemIds = [...new Set(rules.flatMap((r) => r.menuItemIds))];
    const found = await this.prisma.menuItem.count({ where: { id: { in: itemIds }, organizationId } });
    if (found !== itemIds.length) throw new BadRequestException('A reward item is not on this organization\'s menu');
  }

  /**
   * Enrols a customer as a loyalty member. An existing customer is upgraded (never duplicated); a
   * number with no customer yet creates one. Needs a real phone number and name, and the staff
   * member's confirmation that the customer agreed to receive loyalty messages.
   */
  async enrol(ctx: { organizationId: string; actorId: string }, dto: EnrolMemberDto) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { loyaltyEnabled: true, phoneCountry: true, phoneBlocklist: true },
    });
    if (!org.loyaltyEnabled) throw new BadRequestException({ message: 'Loyalty is not switched on', code: 'LOYALTY_OFF' });
    if (!dto.consent) {
      throw new BadRequestException({ message: 'Confirm the customer agrees to receive loyalty offers and rewards', code: 'LOYALTY_CONSENT_REQUIRED' });
    }
    if (!dto.customerId && !dto.phone?.trim()) throw new BadRequestException('Enter the customer\'s phone number');

    // Save the number first when there is one to save: it finds the customer who already holds it
    // (never a duplicate) and credits the collection drive exactly as the plain phone field does.
    let customerId = dto.customerId;
    let phoneCredited = false;
    const existingForCapture = customerId
      ? await this.prisma.customer.findFirst({ where: { id: customerId, organizationId: ctx.organizationId }, select: { id: true, phone: true } })
      : null;
    if (customerId && !existingForCapture) throw new NotFoundException('Customer not found');

    if (dto.phone?.trim() && !existingForCapture?.phone) {
      const captured = await this.phoneCapture.capture(
        {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          source: CREDIT_SOURCE[dto.source],
          orderId: dto.orderId,
          clientRequestId: dto.clientRequestId,
        },
        { phone: dto.phone, name: dto.name, email: dto.email, customerId },
      );
      customerId = captured.customer.id;
      phoneCredited = captured.credited;
    }

    const customer = await this.prisma.customer.findFirstOrThrow({ where: { id: customerId, organizationId: ctx.organizationId } });

    // A stored junk number ("090xxxx") can't identify a member; make staff fix it first.
    const valid = customer.phone ? normalisePhone(customer.phone, org.phoneCountry, org.phoneBlocklist) : null;
    if (!valid || !valid.ok) {
      throw new BadRequestException({
        message: valid && !valid.ok ? `Fix the phone number first — ${PHONE_REJECTION_MESSAGES[valid.reason].toLowerCase()}` : 'Add a phone number before enrolling',
        code: 'PHONE_INVALID',
      });
    }

    const typedName = dto.name?.trim();
    const name = typedName || customer.name;
    if (!name || looksLikeNumber(name)) {
      throw new BadRequestException({ message: 'Enter the customer\'s name', code: 'LOYALTY_NAME_REQUIRED' });
    }

    // Conditional on not-yet-a-member, so a double-tap or a second device enrols once and the
    // original enroller/time/place is kept.
    const upgraded = await this.prisma.$transaction(async (tx) => {
      const res = await tx.customer.updateMany({
        where: { id: customer.id, organizationId: ctx.organizationId, isMember: false },
        data: {
          isMember: true,
          enrolledById: ctx.actorId,
          enrolledAt: new Date(),
          enrolSource: dto.source as LoyaltyEnrolSource,
          messageConsentAt: new Date(),
          name,
          ...(dto.email && !customer.email ? { email: dto.email } : {}),
        },
      });
      // A newly enrolled member gets the welcome message (queued; sent by the worker).
      if (res.count === 1) {
        await tx.loyaltyMessage.create({ data: { organizationId: ctx.organizationId, customerId: customer.id, kind: 'WELCOME' } });
      }
      return res;
    });

    const fresh = await this.prisma.customer.findFirstOrThrow({ where: { id: customer.id, organizationId: ctx.organizationId } });
    return {
      customer: { id: fresh.id, name: fresh.name, phone: fresh.phone, isMember: fresh.isMember },
      enrolled: upgraded.count === 1,
      phoneCredited,
    };
  }

  /**
   * What the till shows for a member: lifetime spend, rewards they can use now (with the items they
   * can choose from) and how far they are from the next reward of each kind.
   */
  async getMemberSummary(organizationId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true, name: true, phone: true, isMember: true, lifetimeSpend: true, enrolledAt: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (!customer.isMember) {
      return { customer: { ...customer, lifetimeSpend: toNumber(customer.lifetimeSpend) }, rewards: [], progress: [] };
    }

    const [rewards, rules] = await Promise.all([
      this.prisma.loyaltyReward.findMany({
        where: { organizationId, customerId, status: 'AVAILABLE', expiresAt: { gt: new Date() } },
        orderBy: { expiresAt: 'asc' },
        include: { rule: { include: { items: { include: { menuItem: { select: { id: true, name: true, isAvailable: true } } } } } } },
      }),
      this.prisma.loyaltyRewardRule.findMany({
        where: { organizationId, isActive: true, items: { some: {} } },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, thresholdAmount: true, repeating: true },
      }),
    ]);

    const spendKobo = toKobo(customer.lifetimeSpend);
    return {
      customer: { ...customer, lifetimeSpend: toNumber(customer.lifetimeSpend) },
      rewards: rewards.map((r) => ({
        id: r.id,
        ruleId: r.ruleId,
        name: r.rule.name,
        expiresAt: r.expiresAt,
        maxPerOrder: r.rule.maxPerOrder,
        items: r.rule.items.filter((i) => i.menuItem.isAvailable).map((i) => ({ id: i.menuItem.id, name: i.menuItem.name })),
      })),
      progress: rules
        .map((r) => {
          const next = toNextReward(spendKobo, toKobo(r.thresholdAmount), r.repeating);
          return next == null ? null : { ruleId: r.id, name: r.name, toNext: next / 100 };
        })
        .filter((p): p is { ruleId: string; name: string; toNext: number } => p !== null),
    };
  }

  /**
   * Messages that did not reach the customer, for staff to follow up: sends that ran out of retries,
   * plus sends WhatsApp accepted but Meta later reported as undeliverable (for example error 131049,
   * Meta's limit on how many marketing messages one person receives). Covers both the welcome and the
   * reward-earned message; a reward message carries what was earned so staff can tell the customer in
   * person. Newest first.
   */
  async undelivered(organizationId: string) {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        kind: string;
        customer_id: string;
        name: string;
        phone: string | null;
        last_error: string | null;
        created_at: Date;
        delivery_error: string | null;
        reward_text: string | null;
      }[]
    >`
      SELECT m.id, m.kind, m.customer_id, c.name, c.phone, m.last_error, m.created_at,
             w.error_message AS delivery_error, m.payload->>'rewardText' AS reward_text
      FROM loyalty_messages m
      JOIN customers c ON c.id = m.customer_id
      LEFT JOIN whatsapp_messages w ON w.provider_message_id = m.provider_message_id
      WHERE m.organization_id = ${organizationId}
        AND m.resolved_at IS NULL
        AND (m.status = 'FAILED' OR (m.status = 'SENT' AND w.status = 'FAILED'))
      ORDER BY m.created_at DESC
      LIMIT 500
    `;
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as 'WELCOME' | 'REWARD_EARNED',
      customerId: r.customer_id,
      name: r.name,
      phone: r.phone,
      reason: r.delivery_error || r.last_error || 'Could not be delivered',
      // What was earned, so staff know what to tell the customer (reward messages only)
      rewardText: r.reward_text,
      createdAt: r.created_at,
    }));
  }

  /** Staff followed this one up by hand (told the customer in person, or called them). */
  async resolveUndelivered(organizationId: string, id: string, userId: string) {
    const res = await this.prisma.loyaltyMessage.updateMany({
      where: { id, organizationId, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedById: userId },
    });
    if (res.count === 0) throw new NotFoundException('Message not found');
    return { resolved: true };
  }

  /**
   * Put a failed welcome back in the queue to be sent again. Only the welcome: a reward message has a
   * reward and an expiry date worked out at the time, and Meta's per-person limit would only refuse it again.
   */
  async retryUndelivered(organizationId: string, id: string) {
    const res = await this.prisma.loyaltyMessage.updateMany({
      where: { id, organizationId, kind: 'WELCOME', status: { in: ['FAILED', 'SKIPPED', 'SENT'] }, resolvedAt: null },
      data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lastError: null, providerMessageId: null },
    });
    if (res.count === 0) throw new NotFoundException('Message not found, or it cannot be sent again');
    return { queued: true };
  }

  /** Every loyalty member (name, phone, email, enrolled date, lifetime spend) as a CSV, e.g. to invite them to a tasting. */
  async membersCsv(organizationId: string) {
    const members = await this.prisma.customer.findMany({
      where: { organizationId, isMember: true },
      orderBy: [{ lifetimeSpend: 'desc' }, { name: 'asc' }],
      select: { name: true, phone: true, email: true, enrolledAt: true, lifetimeSpend: true },
    });
    const rows: (string | number)[][] = [['Name', 'Phone', 'Email', 'Enrolled', 'Lifetime spend']];
    for (const m of members) {
      rows.push([m.name, m.phone ?? '', m.email ?? '', m.enrolledAt ? m.enrolledAt.toISOString().slice(0, 10) : '', toNumber(m.lifetimeSpend)]);
    }
    return { filename: `loyalty-members-${new Date().toISOString().slice(0, 10)}.csv`, csv: toCsv(rows) };
  }
}
