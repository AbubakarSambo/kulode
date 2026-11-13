import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { startOfNextZonedDay, startOfZonedDay, todayInZone } from '../../common';
import { PrismaService } from '../prisma/prisma.service';
import { customerCoverage } from '../collection/collection.coverage';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const toNumber = (v: Prisma.Decimal | number | bigint | string | null | undefined) => (v == null ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class LoyaltyReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolves "from"/"to" (inclusive local dates) to instants in the organization's timezone; defaults to the last 30 days. */
  private async range(organizationId: string, from?: string, to?: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
    const today = todayInZone(org.timezone);
    const end = to ?? today;
    const start = from ?? todayInZone(org.timezone, new Date(Date.now() - 29 * 86_400_000));
    if (!DATE.test(start) || !DATE.test(end)) throw new BadRequestException('Dates must be YYYY-MM-DD');
    if (start > end) throw new BadRequestException('The start date is after the end date');
    return { from: start, to: end, gte: startOfZonedDay(start, org.timezone), lt: startOfNextZonedDay(end, org.timezone), timezone: org.timezone };
  }

  /**
   * The loyalty report: members and who enrolled them, member vs non-member spend, rewards earned /
   * redeemed / expired, and what the redeemed rewards cost. Member spend comes from the loyalty
   * ledger (what the programme actually counted), so spend before someone enrolled is not member spend.
   */
  async summary(organizationId: string, from?: string, to?: string) {
    const r = await this.range(organizationId, from, to);
    const inRange = (field: string) => ({ [field]: { gte: r.gte, lt: r.lt } });

    const [totalMembers, newMembers, enrolledBy, ledger, allSpend, earned, redeemed, expired, available] = await Promise.all([
      this.prisma.customer.count({ where: { organizationId, isMember: true } }),
      this.prisma.customer.count({ where: { organizationId, isMember: true, ...inRange('enrolledAt') } }),
      this.prisma.customer.groupBy({ by: ['enrolledById'], where: { organizationId, isMember: true, ...inRange('enrolledAt') }, _count: true }),
      this.prisma.loyaltyLedger.aggregate({ where: { organizationId, ...inRange('createdAt') }, _sum: { amount: true } }),
      this.prisma.$queryRaw<{ spend: Prisma.Decimal | null; orders: bigint }[]>`
        SELECT COALESCE(SUM(subtotal - discount_amount), 0) AS spend, COUNT(*) AS orders
        FROM orders
        WHERE organization_id = ${organizationId} AND status = 'CLOSED_PAID'
          AND closed_at >= ${r.gte} AND closed_at < ${r.lt}
      `,
      this.prisma.loyaltyReward.count({ where: { organizationId, ...inRange('earnedAt') } }),
      this.prisma.loyaltyReward.aggregate({
        where: { organizationId, status: 'REDEEMED', ...inRange('redeemedAt') },
        _count: true,
        _sum: { redeemedFoodCost: true, redeemedMenuPrice: true },
      }),
      this.prisma.loyaltyReward.count({ where: { organizationId, status: 'EXPIRED', ...inRange('expiresAt') } }),
      this.prisma.$queryRaw<{ count: bigint; cost: Prisma.Decimal | null }[]>`
        SELECT COUNT(*) AS count, COALESCE(SUM(rule.food_cost), 0) AS cost
        FROM loyalty_rewards rw JOIN loyalty_reward_rules rule ON rule.id = rw.rule_id
        WHERE rw.organization_id = ${organizationId} AND rw.status = 'AVAILABLE' AND rw.expires_at > now()
      `,
    ]);

    const staffIds = enrolledBy.map((e) => e.enrolledById).filter((id): id is string => !!id);
    const staff = staffIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: staffIds }, organizationId }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const nameOf = new Map(staff.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

    const total = toNumber(allSpend[0]?.spend);
    const memberSpend = Math.min(total, round2(toNumber(ledger._sum.amount)));
    const foodCost = toNumber(redeemed._sum.redeemedFoodCost);
    return {
      range: { from: r.from, to: r.to },
      members: {
        total: totalMembers,
        newInPeriod: newMembers,
        byStaff: enrolledBy
          .map((e) => ({ userId: e.enrolledById, name: e.enrolledById ? (nameOf.get(e.enrolledById) ?? 'Former staff') : 'Unknown', count: e._count }))
          .sort((a, b) => b.count - a.count),
      },
      spend: {
        total,
        member: memberSpend,
        nonMember: round2(total - memberSpend),
        memberSharePct: total > 0 ? Math.round((memberSpend / total) * 1000) / 10 : 0,
        orders: Number(allSpend[0]?.orders ?? 0),
      },
      rewards: { earned, redeemed: redeemed._count, expired },
      cost: {
        foodCost,
        menuValue: toNumber(redeemed._sum.redeemedMenuPrice),
        pctOfMemberSpend: memberSpend > 0 ? Math.round((foodCost / memberSpend) * 1000) / 10 : 0,
      },
      outstanding: { rewards: Number(available[0]?.count ?? 0), foodCost: toNumber(available[0]?.cost) },
    };
  }

  /** Writes today's coverage figure for one organization (the last write of the local day wins). */
  async snapshotCoverage(organizationId: string, timezone: string) {
    const date = todayInZone(timezone);
    const { customers, withPhone } = await customerCoverage(this.prisma, organizationId);
    await this.prisma.coverageSnapshot.upsert({
      where: { organizationId_date: { organizationId, date } },
      create: { organizationId, date, customers, withPhone },
      update: { customers, withPhone },
    });
  }

  /** The daily history (oldest first) and today's live figure. */
  async coverage(organizationId: string, days: number) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
    const since = todayInZone(org.timezone, new Date(Date.now() - (days - 1) * 86_400_000));
    const [rows, live] = await Promise.all([
      this.prisma.coverageSnapshot.findMany({ where: { organizationId, date: { gte: since } }, orderBy: { date: 'asc' } }),
      customerCoverage(this.prisma, organizationId),
    ]);
    return {
      live,
      days: rows.map((x) => ({ date: x.date, customers: x.customers, withPhone: x.withPhone, pct: x.customers ? Math.round((x.withPhone / x.customers) * 1000) / 10 : 0 })),
    };
  }
}
