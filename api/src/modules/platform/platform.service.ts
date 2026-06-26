import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlanTier, SubscriptionStatus } from '@prisma/client';

@Injectable()
export class PlatformService {
  constructor(private prisma: PrismaService) {}

  private calculateMoMChange(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Number((((current - previous) / previous) * 100).toFixed(1));
  }

  async getDashboard() {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // MoM date boundaries
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

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
      lastMonthOrgs,
      currentMonthGmvResult,
      lastMonthGmvResult,
      currentMonthFeesResult,
      lastMonthFeesResult,
      currentMonthSubRevenueResult,
      lastMonthSubRevenueResult,
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

      // Last month organizations
      this.prisma.organization.count({
        where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
      }),

      // Current month GMV
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: {
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          deletedAt: null,
          createdAt: { gte: startOfCurrentMonth },
        },
      }),

      // Last month GMV
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: {
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          deletedAt: null,
          createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
      }),

      // Current month platform fees
      this.prisma.payment.aggregate({
        _sum: { platformFees: true },
        where: { createdAt: { gte: startOfCurrentMonth } },
      }),

      // Last month platform fees
      this.prisma.payment.aggregate({
        _sum: { platformFees: true },
        where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
      }),

      // Current month subscription payments
      this.prisma.subscriptionPayment.aggregate({
        _sum: { amount: true },
        where: { createdAt: { gte: startOfCurrentMonth } },
      }),

      // Last month subscription payments
      this.prisma.subscriptionPayment.aggregate({
        _sum: { amount: true },
        where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
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

    const orgsMoMChange = this.calculateMoMChange(newOrgsThisMonth, lastMonthOrgs);

    const curMonthGmv = Number(currentMonthGmvResult._sum.total) || 0;
    const prevMonthGmv = Number(lastMonthGmvResult._sum.total) || 0;
    const gmvMoMChange = this.calculateMoMChange(curMonthGmv, prevMonthGmv);

    const curMonthFees = Number(currentMonthFeesResult._sum.platformFees) || 0;
    const prevMonthFees = Number(lastMonthFeesResult._sum.platformFees) || 0;
    const feesMoMChange = this.calculateMoMChange(curMonthFees, prevMonthFees);

    const curMonthSubs = Number(currentMonthSubRevenueResult._sum.amount) || 0;
    const prevMonthSubs = Number(lastMonthSubRevenueResult._sum.amount) || 0;
    const subsMoMChange = this.calculateMoMChange(curMonthSubs, prevMonthSubs);

    return {
      organizations: {
        total: totalOrgs,
        newThisWeek: newOrgsThisWeek,
        newThisMonth: newOrgsThisMonth,
        active: activeOrgs,
        inactive: totalOrgs - activeOrgs,
        lastMonth: lastMonthOrgs,
        changePct: orgsMoMChange,
      },
      users: {
        total: totalUsers,
      },
      revenue: {
        gmv: Number(gmvResult._sum.total) || 0,
        gmvCurrentMonth: curMonthGmv,
        gmvPreviousMonth: prevMonthGmv,
        gmvChangePct: gmvMoMChange,
        platformFees: Number(platformFeeResult._sum.platformFees) || 0,
        platformFeesCurrentMonth: curMonthFees,
        platformFeesPreviousMonth: prevMonthFees,
        platformFeesChangePct: feesMoMChange,
      },
      invoices: invoiceStatusBreakdown,
      subscriptions: {
        byPlan,
        byStatus,
        grandfathered: grandfatheredCount,
        revenue: Number(subscriptionRevenueResult._sum.amount) || 0,
        revenueCurrentMonth: curMonthSubs,
        revenuePreviousMonth: prevMonthSubs,
        revenueChangePct: subsMoMChange,
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

  async getOrganizations(query: {
    search?: string;
    planTier?: PlanTier;
    subscriptionStatus?: SubscriptionStatus;
    isGrandfathered?: boolean | string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.planTier) {
      where.planTier = query.planTier;
    }

    if (query.subscriptionStatus) {
      where.subscriptionStatus = query.subscriptionStatus;
    }

    if (query.isGrandfathered !== undefined) {
      where.isGrandfathered = query.isGrandfathered === 'true' || query.isGrandfathered === true;
    }

    const [items, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          email: true,
          phone: true,
          planTier: true,
          subscriptionStatus: true,
          isGrandfathered: true,
          platformFeePercent: true,
          createdAt: true,
          _count: {
            select: {
              users: true,
              invoices: true,
            },
          },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    const formattedItems = items.map((org) => ({
      ...org,
      userCount: org._count.users,
      invoiceCount: org._count.invoices,
      platformFeePercent: Number(org.platformFeePercent),
    }));

    return {
      items: formattedItems,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getOrganizationDetails(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            invoices: true,
            clients: true,
            payments: true,
          },
        },
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!org) {
      return null;
    }

    // Get aggregate financial info for this org
    const invoiceAggregation = await this.prisma.invoice.aggregate({
      _sum: { total: true },
      where: {
        organizationId: id,
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        deletedAt: null,
      },
    });

    const paymentAggregation = await this.prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        organizationId: id,
      },
    });

    return {
      ...org,
      platformFeePercent: Number(org.platformFeePercent),
      userCount: org._count.users,
      invoiceCount: org._count.invoices,
      clientCount: org._count.clients,
      paymentCount: org._count.payments,
      totalGmv: Number(invoiceAggregation._sum.total) || 0,
      totalPayments: Number(paymentAggregation._sum.amount) || 0,
    };
  }

  async updateOrganization(id: string, data: {
    planTier?: PlanTier;
    subscriptionStatus?: SubscriptionStatus;
    isGrandfathered?: boolean;
    platformFeePercent?: number;
  }) {
    const updateData: any = {};

    if (data.planTier !== undefined) {
      updateData.planTier = data.planTier;
    }

    if (data.subscriptionStatus !== undefined) {
      updateData.subscriptionStatus = data.subscriptionStatus;
    }

    if (data.isGrandfathered !== undefined) {
      updateData.isGrandfathered = data.isGrandfathered;
    }

    if (data.platformFeePercent !== undefined) {
      updateData.platformFeePercent = data.platformFeePercent;
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: updateData,
    });

    return {
      ...updated,
      platformFeePercent: Number(updated.platformFeePercent),
    };
  }
}
