import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LoyaltyEnrolSource, PhoneCreditSource, Prisma } from '@prisma/client';
import { normalisePhone, PHONE_REJECTION_MESSAGES } from '../../common';
import { PrismaService } from '../prisma/prisma.service';
import { PhoneCaptureService } from '../customers/phone-capture.service';
import { EnrolMemberDto, RewardRuleDto, UpdateLoyaltySettingsDto } from './dto';

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
    return {
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
      throw new BadRequestException({ message: 'Confirm the customer agrees to receive loyalty messages', code: 'LOYALTY_CONSENT_REQUIRED' });
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
    const upgraded = await this.prisma.customer.updateMany({
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

    const fresh = await this.prisma.customer.findFirstOrThrow({ where: { id: customer.id, organizationId: ctx.organizationId } });
    return {
      customer: { id: fresh.id, name: fresh.name, phone: fresh.phone, isMember: fresh.isMember },
      enrolled: upgraded.count === 1,
      phoneCredited,
    };
  }
}
