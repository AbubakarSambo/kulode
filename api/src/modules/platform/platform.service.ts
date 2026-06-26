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

  async getDashboard(startDateStr?: string, endDateStr?: string) {
    const now = new Date();

    // Default current period: current calendar month
    let currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let currentPeriodEnd = new Date(now);

    // Default prior period: previous calendar month
    let priorPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    let priorPeriodEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    if (startDateStr && endDateStr) {
      currentPeriodStart = new Date(startDateStr);
      currentPeriodEnd = new Date(endDateStr);

      const durationMs = currentPeriodEnd.getTime() - currentPeriodStart.getTime();
      priorPeriodEnd = new Date(currentPeriodStart.getTime() - 1);
      priorPeriodStart = new Date(currentPeriodStart.getTime() - durationMs);
    }

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Health metric boundaries
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);
    const nextMonth = new Date(now);
    nextMonth.setDate(now.getDate() + 30);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

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
      // ── New health metrics ──
      trialsExpiringThisWeekList,
      trialsExpiringThisMonthCount,
      monthlyActiveTenantsCount,
      paidGmvResult,
      currentMonthPaidGmvResult,
      lastMonthPaidGmvResult,
      cancelledOrgsCount,
      orgsPlanStatusGroup,
    ] = await Promise.all([
      // Total organizations
      this.prisma.organization.count(),

      // New orgs this week
      this.prisma.organization.count({
        where: { createdAt: { gte: startOfWeek } },
      }),

      // New orgs this month
      this.prisma.organization.count({
        where: { createdAt: { gte: currentPeriodStart, lte: currentPeriodEnd } },
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
          trialEndDate: true,
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
          AND i.status = 'PAID'
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
        where: { createdAt: { gte: priorPeriodStart, lte: priorPeriodEnd } },
      }),

      // Current month GMV
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: {
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          deletedAt: null,
          createdAt: { gte: currentPeriodStart, lte: currentPeriodEnd },
        },
      }),

      // Last month GMV
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: {
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          deletedAt: null,
          createdAt: { gte: priorPeriodStart, lte: priorPeriodEnd },
        },
      }),

      // Current month platform fees
      this.prisma.payment.aggregate({
        _sum: { platformFees: true },
        where: { createdAt: { gte: currentPeriodStart, lte: currentPeriodEnd } },
      }),

      // Last month platform fees
      this.prisma.payment.aggregate({
        _sum: { platformFees: true },
        where: { createdAt: { gte: priorPeriodStart, lte: priorPeriodEnd } },
      }),

      // Current month subscription payments (MRR proxy)
      this.prisma.subscriptionPayment.aggregate({
        _sum: { amount: true },
        where: { createdAt: { gte: currentPeriodStart, lte: currentPeriodEnd } },
      }),

      // Last month subscription payments
      this.prisma.subscriptionPayment.aggregate({
        _sum: { amount: true },
        where: { createdAt: { gte: priorPeriodStart, lte: priorPeriodEnd } },
      }),

      // ── Health metrics ──

      // Trials expiring this week (action list)
      this.prisma.organization.findMany({
        where: {
          subscriptionStatus: 'TRIALING',
          trialEndDate: { gte: now, lte: nextWeek },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          planTier: true,
          trialStartDate: true,
          trialEndDate: true,
          _count: { select: { users: true, invoices: true } },
        },
        orderBy: { trialEndDate: 'asc' },
      }),

      // Trials expiring this month (count for alert)
      this.prisma.organization.count({
        where: {
          subscriptionStatus: 'TRIALING',
          trialEndDate: { gte: now, lte: nextMonth },
        },
      }),

      // Monthly Active Tenants — orgs with at least 1 invoice in the last 30 days
      this.prisma.organization.count({
        where: {
          invoices: {
            some: {
              createdAt: { gte: thirtyDaysAgo },
              deletedAt: null,
            },
          },
        },
      }),

      // Collected GMV — PAID invoices only (all-time)
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: { status: 'PAID', deletedAt: null },
      }),

      // Current month collected GMV
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: {
          status: 'PAID',
          deletedAt: null,
          createdAt: { gte: currentPeriodStart, lte: currentPeriodEnd },
        },
      }),

      // Last month collected GMV
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: {
          status: 'PAID',
          deletedAt: null,
          createdAt: { gte: priorPeriodStart, lte: priorPeriodEnd },
        },
      }),

      // Churned orgs (CANCELLED + EXPIRED)
      this.prisma.organization.count({
        where: {
          subscriptionStatus: { in: ['CANCELLED', 'EXPIRED'] },
        },
      }),

      // Joint plan and status grouping for detailed breakdown
      this.prisma.organization.groupBy({
        by: ['planTier', 'subscriptionStatus'],
        _count: { id: true },
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

    const byPlanStatus: Record<string, { TRIALING: number; ACTIVE: number; CANCELLED: number; EXPIRED: number }> = {
      FREE: { TRIALING: 0, ACTIVE: 0, CANCELLED: 0, EXPIRED: 0 },
      STARTER: { TRIALING: 0, ACTIVE: 0, CANCELLED: 0, EXPIRED: 0 },
      PRO: { TRIALING: 0, ACTIVE: 0, CANCELLED: 0, EXPIRED: 0 },
      BUSINESS: { TRIALING: 0, ACTIVE: 0, CANCELLED: 0, EXPIRED: 0 },
    };

    for (const item of orgsPlanStatusGroup) {
      const plan = item.planTier;
      const status = item.subscriptionStatus;
      if (plan in byPlanStatus && status in byPlanStatus[plan as keyof typeof byPlanStatus]) {
        byPlanStatus[plan as keyof typeof byPlanStatus][status as 'TRIALING' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED'] = item._count.id;
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

    // Health metric computations
    const activePayingOrgs = byStatus.ACTIVE;
    const trialConversionRate = totalOrgs > 0
      ? Number(((activePayingOrgs / totalOrgs) * 100).toFixed(1))
      : 0;

    const monthlyActiveTenantsRate = totalOrgs > 0
      ? Number(((monthlyActiveTenantsCount / totalOrgs) * 100).toFixed(1))
      : 0;

    const collectedGmv = Number(paidGmvResult._sum.total) || 0;
    const curMonthCollectedGmv = Number(currentMonthPaidGmvResult._sum.total) || 0;
    const prevMonthCollectedGmv = Number(lastMonthPaidGmvResult._sum.total) || 0;
    const collectedGmvChangePct = this.calculateMoMChange(curMonthCollectedGmv, prevMonthCollectedGmv);

    // Calculate last 6 months trends
    const trendMonths: Array<{ start: Date; end: Date; label: string }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const label = d.toLocaleString('en-US', { month: 'short' });
      trendMonths.push({ start, end, label });
    }

    const trendDataPromises = trendMonths.map(async (m) => {
      const [mrrAgg, gmvAgg, payingCount, trialingCount] = await Promise.all([
        this.prisma.subscriptionPayment.aggregate({
          _sum: { amount: true },
          where: { createdAt: { gte: m.start, lte: m.end } },
        }),
        this.prisma.invoice.aggregate({
          _sum: { total: true },
          where: {
            status: 'PAID',
            deletedAt: null,
            createdAt: { gte: m.start, lte: m.end },
          },
        }),
        this.prisma.organization.count({
          where: {
            createdAt: { lte: m.end },
            planTier: { in: ['STARTER', 'PRO', 'BUSINESS'] },
            subscriptionStatus: 'ACTIVE',
          },
        }),
        this.prisma.organization.count({
          where: {
            createdAt: { lte: m.end },
            subscriptionStatus: 'TRIALING',
          },
        }),
      ]);

      return {
        month: m.label,
        mrr: Number(mrrAgg._sum.amount) || 0,
        collectedGmv: Number(gmvAgg._sum.total) || 0,
        payingTenants: payingCount,
        trialingTenants: trialingCount,
      };
    });

    const trends = await Promise.all(trendDataPromises);

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
        byPlanStatus,
        grandfathered: grandfatheredCount,
        revenue: Number(subscriptionRevenueResult._sum.amount) || 0,
        revenueCurrentMonth: curMonthSubs,
        revenuePreviousMonth: prevMonthSubs,
        revenueChangePct: subsMoMChange,
      },
      health: {
        trialConversionRate,
        monthlyActiveTenants: monthlyActiveTenantsCount,
        monthlyActiveTenantsRate,
        trialsExpiringThisWeek: trialsExpiringThisWeekList.length,
        trialsExpiringThisMonth: trialsExpiringThisMonthCount,
        churnedOrgs: cancelledOrgsCount,
        collectedGmv,
        collectedGmvCurrentMonth: curMonthCollectedGmv,
        collectedGmvPreviousMonth: prevMonthCollectedGmv,
        collectedGmvChangePct,
        trialsExpiringSoon: trialsExpiringThisWeekList.map((org) => {
          const daysRemaining = org.trialEndDate
            ? Math.floor((new Date(org.trialEndDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            : null;
          return {
            id: org.id,
            name: org.name,
            slug: org.slug,
            planTier: org.planTier,
            trialEndDate: org.trialEndDate,
            daysRemaining,
            userCount: org._count.users,
            invoiceCount: org._count.invoices,
          };
        }),
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
        trialEndDate: org.trialEndDate,
      })),
      topOrganizations: topOrgsByVolume,
      trends,
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
    const now = new Date();

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
          trialStartDate: true,
          trialEndDate: true,
          subscriptionStartDate: true,
          createdAt: true,
          _count: {
            select: {
              users: true,
              invoices: true,
            },
          },
          // Latest invoice date as "last active" proxy
          invoices: {
            select: { createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
            where: { deletedAt: null },
          },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    const formattedItems = items.map((org) => {
      const daysInTrial = org.trialStartDate
        ? Math.floor((now.getTime() - new Date(org.trialStartDate).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const trialDaysRemaining = org.trialEndDate
        ? Math.floor((new Date(org.trialEndDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const lastInvoiceAt = org.invoices[0]?.createdAt ?? null;

      return {
        ...org,
        invoices: undefined, // strip the raw relation from response
        userCount: org._count.users,
        invoiceCount: org._count.invoices,
        platformFeePercent: Number(org.platformFeePercent),
        daysInTrial,
        trialDaysRemaining,
        lastInvoiceAt,
      };
    });

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
