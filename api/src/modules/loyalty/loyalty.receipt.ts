import { PrismaService } from '../prisma/prisma.service';
import { toKobo, toNextReward } from './loyalty.earn';

export interface LoyaltyReceipt {
  /** Spend left before the member's next reward (nearest of the programme's rewards); null if none is left to earn */
  toNextReward: number | null;
  rewardsAvailable: number;
}

/** What a receipt says about the member on it, or null when there is nothing to say (not a member, programme off). */
export async function loyaltyReceipt(prisma: PrismaService, organizationId: string, customerId: string | null | undefined): Promise<LoyaltyReceipt | null> {
  if (!customerId) return null;
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { loyaltyEnabled: true } });
  if (!org?.loyaltyEnabled) return null;
  const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { isMember: true, lifetimeSpend: true } });
  if (!customer?.isMember) return null;

  const [rules, rewardsAvailable] = await Promise.all([
    prisma.loyaltyRewardRule.findMany({
      where: { organizationId, isActive: true, items: { some: {} } },
      select: { thresholdAmount: true, repeating: true },
    }),
    prisma.loyaltyReward.count({ where: { organizationId, customerId, status: 'AVAILABLE', expiresAt: { gt: new Date() } } }),
  ]);
  const spend = toKobo(customer.lifetimeSpend);
  const nexts = rules.map((r) => toNextReward(spend, toKobo(r.thresholdAmount), r.repeating)).filter((n): n is number => n !== null);
  return { toNextReward: nexts.length ? Math.min(...nexts) / 100 : null, rewardsAvailable };
}
