import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformService {
  constructor(private prisma: PrismaService) {}

  async getDashboard() {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalOrgs,
      newOrgsThisWeek,
      newOrgsThisMonth,
      activeOrgs,
      totalUsers,
      gmvResult,
      platformFeeResult,
      invoicesByStatus,
      recentSignups,
      topOrganizations,
      orgsByPlan,
      orgsByStatus,
      grandfatheredCount,
      subscriptionRevenueResult,
    ] = await Promise.all([
      // Total organizations
      this.prisma.organization.count(),

      // New orgs this week
      this.prisma.organization.count({
        where: { createdAt: { gte: startOfWeek } },
      }),

      // New orgs this month
      this.prisma.organization.count({
        where: { createdAt: { gte: startOfMonth } },
      }),

      // Active orgs (have at least one invoice)
      this.prisma.organization.count({
        where: { invoices: { some: {} } },
      }),

      // Total users
      this.prisma.user.count(),

      // GMV - sum of invoice totals excluding draft/cancelled
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: {
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          deletedAt: null,
        },
      }),

      // Platform fee revenue
      this.prisma.payment.aggregate({
        _sum: { platformFees: true },
      }),

      // Invoice count by status
      this.prisma.invoice.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { total: true },
        where: { deletedAt: null },
      }),

      // Recent 10 signups (organizations) with user/invoice counts
      this.prisma.organization.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          planTier: true,
          subscriptionStatus: true,
          isGrandfathered: true,
          _count: {
            select: { users: true, invoices: true },
          },
        },
      }),

      // Top 10 organizations by invoice volume (raw query to sort by SUM in DB)
      this.prisma.$queryRaw<
        Array<{
          id: string;
          name: string;
          slug: string;
          createdAt: Date;
          userCount: number;
          invoiceCount: number;
          volume: number;
          planTier: string;
          subscriptionStatus: string;
          isGrandfathered: boolean;
        }>
      >`
        SELECT
          o.id,
          o.name,
          o.slug,
          o.created_at AS "createdAt",
          o.plan_tier AS "planTier",
          o.subscription_status AS "subscriptionStatus",
          o.is_grandfathered AS "isGrandfathered",
          COUNT(DISTINCT u.id)::int AS "userCount",
          COUNT(DISTINCT i.id)::int AS "invoiceCount",
          COALESCE(SUM(i.total), 0)::float8 AS volume
        FROM organizations o
        LEFT JOIN users u ON u.organization_id = o.id
        LEFT JOIN invoices i ON i.organization_id = o.id
          AND i.status NOT IN ('CANCELLED')
          AND i.deleted_at IS NULL
        GROUP BY o.id, o.name, o.slug, o.created_at, o.plan_tier, o.subscription_status, o.is_grandfathered
        ORDER BY volume DESC
        LIMIT 10
      `,

      // Orgs grouped by plan tier
      this.prisma.organization.groupBy({
        by: ['planTier'],
        _count: { id: true },
      }),

      // Orgs grouped by subscription status
      this.prisma.organization.groupBy({
        by: ['subscriptionStatus'],
        _count: { id: true },
      }),

      // Count of grandfathered orgs
      this.prisma.organization.count({
        where: { isGrandfathered: true },
      }),

      // Total subscription payment revenue
      this.prisma.subscriptionPayment.aggregate({
        _sum: { amount: true },
      }),
    ]);

    // topOrganizations is already sorted by volume from the DB
    const topOrgsByVolume = topOrganizations.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      userCount: org.userCount,
      invoiceCount: org.invoiceCount,
      volume: org.volume,
      createdAt: org.createdAt,
      planTier: org.planTier,
      subscriptionStatus: org.subscriptionStatus,
      isGrandfathered: org.isGrandfathered,
    }));

    // Process subscription breakdowns
    const byPlan = { FREE: 0, STARTER: 0, PRO: 0, BUSINESS: 0 };
    for (const item of orgsByPlan) {
      if (item.planTier in byPlan) {
        byPlan[item.planTier as keyof typeof byPlan] = item._count.id;
      }
    }

    const byStatus = { TRIALING: 0, ACTIVE: 0, CANCELLED: 0, EXPIRED: 0 };
    for (const item of orgsByStatus) {
      if (item.subscriptionStatus in byStatus) {
        byStatus[item.subscriptionStatus as keyof typeof byStatus] =
          item._count.id;
      }
    }

    // Process invoice status breakdown
    const invoiceStatusBreakdown = invoicesByStatus.reduce(
      (acc, item) => {
        acc[item.status] = {
          count: item._count.id,
          total: Number(item._sum.total) || 0,
        };
        return acc;
      },
      {} as Record<string, { count: number; total: number }>,
    );

    return {
      organizations: {
        total: totalOrgs,
        newThisWeek: newOrgsThisWeek,
        newThisMonth: newOrgsThisMonth,
        active: activeOrgs,
        inactive: totalOrgs - activeOrgs,
      },
      users: {
        total: totalUsers,
      },
      revenue: {
        gmv: Number(gmvResult._sum.total) || 0,
        platformFees: Number(platformFeeResult._sum.platformFees) || 0,
      },
      invoices: invoiceStatusBreakdown,
      subscriptions: {
        byPlan,
        byStatus,
        grandfathered: grandfatheredCount,
        revenue: Number(subscriptionRevenueResult._sum.amount) || 0,
      },
      recentSignups: recentSignups.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        userCount: org._count.users,
        invoiceCount: org._count.invoices,
        createdAt: org.createdAt,
        planTier: org.planTier,
        subscriptionStatus: org.subscriptionStatus,
        isGrandfathered: org.isGrandfathered,
      })),
      topOrganizations: topOrgsByVolume,
    };
  }
}
