import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { expiryText, rewardText } from './loyalty.messages';

// Money is compared in whole kobo so "floor(spend / threshold)" never suffers float drift.
export const toKobo = (v: Prisma.Decimal | number | string | null | undefined): number => Math.round(Number(v ?? 0) * 100);

/** How many of a reward a lifetime spend has earned in total. A non-repeating reward is earned once. */
export function rewardsEarnedTotal(spendKobo: number, thresholdKobo: number, repeating: boolean): number {
  if (thresholdKobo <= 0 || spendKobo <= 0) return 0;
  const n = Math.floor(spendKobo / thresholdKobo);
  return repeating ? n : Math.min(n, 1);
}

/** Spend left before the next reward of this kind (undefined when a one-off reward is already earned). */
export function toNextReward(spendKobo: number, thresholdKobo: number, repeating: boolean): number | null {
  if (thresholdKobo <= 0) return null;
  if (!repeating && spendKobo >= thresholdKobo) return null;
  return thresholdKobo - (spendKobo % thresholdKobo);
}

export interface EarnedReward {
  ruleId: string;
  name: string;
  count: number;
}

export interface CreditResult {
  customerId: string;
  /** Qualifying spend credited for this order */
  amount: number;
  lifetimeSpend: number;
  rewards: EarnedReward[];
}

export interface EarnOptions {
  /** Credit even if the order was paid before the customer enrolled (a supervisor attached them afterwards). */
  force?: boolean;
  actorId?: string;
  /** Why — kept on the ledger row (e.g. a supervisor's reason for attaching a number after payment). */
  note?: string;
}

interface LockedCustomer {
  id: string;
  is_member: boolean;
  enrolled_at: Date | null;
  lifetime_spend: Prisma.Decimal | string;
}

/**
 * Credits a paid order's spend to the member on it and issues any rewards that spend has earned.
 *
 * Safe to call any number of times, from any payment path, and concurrently: the member row is
 * locked for the duration so two orders paid at once can't both read the same "before" total and
 * issue a reward twice or skip one, and the ledger's unique key means one order credits one
 * customer once. Returns null when nothing was credited (no member, programme off, already done…).
 */
export async function creditOrderSpend(prisma: PrismaService, orderId: string, opts: EarnOptions = {}): Promise<CreditResult | null> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, organizationId: true, customerId: true, status: true, subtotal: true, discountAmount: true, closedAt: true },
    });
    if (!order || order.status !== 'CLOSED_PAID' || !order.customerId || !order.closedAt) return null;

    const org = await tx.organization.findUnique({
      where: { id: order.organizationId },
      select: { loyaltyEnabled: true, loyaltyStartAt: true, loyaltyExpiryDays: true, timezone: true },
    });
    // Only orders paid after the programme went live count — there is no back-credit.
    if (!org?.loyaltyEnabled || !org.loyaltyStartAt || order.closedAt < org.loyaltyStartAt) return null;

    const [customer] = await tx.$queryRaw<LockedCustomer[]>`
      SELECT id, is_member, enrolled_at, lifetime_spend FROM customers
      WHERE id = ${order.customerId} AND organization_id = ${order.organizationId}
      FOR UPDATE
    `;
    if (!customer?.is_member) return null;
    if (!opts.force && customer.enrolled_at && order.closedAt < customer.enrolled_at) return null;

    // Qualifying spend: the order subtotal after discounts, before service charge and VAT.
    // Zero-priced lines (including redeemed rewards) add nothing on their own.
    const spendKobo = Math.max(0, toKobo(order.subtotal) - toKobo(order.discountAmount));
    if (spendKobo === 0) return null;

    // skipDuplicates (not create + catch): a unique violation would poison the transaction.
    const ledger = await tx.loyaltyLedger.createMany({
      data: [
        {
          organizationId: order.organizationId,
          customerId: customer.id,
          orderId: order.id,
          amount: spendKobo / 100,
          entryType: 'SPEND',
          note: opts.note,
          createdById: opts.actorId,
        },
      ],
      skipDuplicates: true,
    });
    if (ledger.count === 0) return null;

    const beforeKobo = toKobo(String(customer.lifetime_spend));
    const afterKobo = beforeKobo + spendKobo;
    await tx.customer.update({ where: { id: customer.id }, data: { lifetimeSpend: afterKobo / 100 } });

    const rules = await tx.loyaltyRewardRule.findMany({
      where: { organizationId: order.organizationId, isActive: true, items: { some: {} } },
      select: { id: true, name: true, thresholdAmount: true, repeating: true, items: { select: { menuItem: { select: { name: true } } } } },
      orderBy: { sortOrder: 'asc' },
    });
    const expiresAt = new Date(Date.now() + org.loyaltyExpiryDays * 86_400_000);
    const rewards: EarnedReward[] = [];
    const earnedForMessage: { count: number; items: string[]; name: string }[] = [];
    for (const rule of rules) {
      const threshold = toKobo(rule.thresholdAmount);
      const count = rewardsEarnedTotal(afterKobo, threshold, rule.repeating) - rewardsEarnedTotal(beforeKobo, threshold, rule.repeating);
      if (count <= 0) continue;
      await tx.loyaltyReward.createMany({
        data: Array.from({ length: count }, () => ({
          organizationId: order.organizationId,
          customerId: customer.id,
          ruleId: rule.id,
          earnedOrderId: order.id,
          expiresAt,
        })),
      });
      rewards.push({ ruleId: rule.id, name: rule.name, count });
      earnedForMessage.push({ count, name: rule.name, items: rule.items.map((i) => i.menuItem.name) });
    }

    // Tell the customer, via the message queue: written in this transaction so it exists exactly
    // when the reward does, and sent later by the worker (which checks consent and retries).
    if (earnedForMessage.length > 0) {
      await tx.loyaltyMessage.create({
        data: {
          organizationId: order.organizationId,
          customerId: customer.id,
          kind: 'REWARD_EARNED',
          payload: { rewardText: rewardText(earnedForMessage), expiryText: expiryText(expiresAt, org.timezone) },
        },
      });
    }

    return { customerId: customer.id, amount: spendKobo / 100, lifetimeSpend: afterKobo / 100, rewards };
  });
}

/**
 * Takes an order's spend back from the member it was credited to (the order was moved to someone
 * else, or the spend was credited in error). Rewards that spend earned and that are still
 * available are cancelled; ones already redeemed stay redeemed.
 */
export async function reverseOrderSpend(prisma: PrismaService, orderId: string, customerId: string, opts: EarnOptions = {}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const spend = await tx.loyaltyLedger.findFirst({ where: { orderId, customerId, entryType: 'SPEND' } });
    if (!spend) return false;

    const [customer] = await tx.$queryRaw<LockedCustomer[]>`
      SELECT id, is_member, enrolled_at, lifetime_spend FROM customers
      WHERE id = ${customerId} AND organization_id = ${spend.organizationId}
      FOR UPDATE
    `;
    if (!customer) return false;

    const reversal = await tx.loyaltyLedger.createMany({
      data: [
        {
          organizationId: spend.organizationId,
          customerId,
          orderId,
          amount: -Number(spend.amount),
          entryType: 'REVERSAL',
          note: opts.note,
          createdById: opts.actorId,
        },
      ],
      skipDuplicates: true,
    });
    if (reversal.count === 0) return false;

    const nextKobo = Math.max(0, toKobo(String(customer.lifetime_spend)) - toKobo(spend.amount));
    await tx.customer.update({ where: { id: customerId }, data: { lifetimeSpend: nextKobo / 100 } });
    await tx.loyaltyReward.updateMany({ where: { earnedOrderId: orderId, customerId, status: 'AVAILABLE' }, data: { status: 'CANCELLED' } });
    return true;
  });
}

/**
 * Payment must never fail because of loyalty, so every payment path calls this after its own
 * transaction has committed. A failure is logged and the hourly catch-up job credits the order.
 */
export async function creditOrderSpendSafe(prisma: PrismaService, logger: Logger, orderId: string, opts: EarnOptions = {}): Promise<CreditResult | null> {
  try {
    return await creditOrderSpend(prisma, orderId, opts);
  } catch (err) {
    logger.error(`Loyalty credit failed for order ${orderId}: ${(err as Error).message}`);
    return null;
  }
}
