import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlanTier, SubscriptionStatus, OrgModule } from '@prisma/client';

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

    // Excludes the team's own internal/QA orgs (see Organization.isTestAccount) from every
    // platform-wide metric, so test data never pollutes real GMV/org-count/top-orgs numbers.
    const nonTestOrgWhere = { isTestAccount: false };
    const nonTestOrgRelationWhere = { organization: { isTestAccount: false } };

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
      // Genuinely paying orgs — ACTIVE and not grandfathered (grandfathered orgs are
      // exempt from billing, so they shouldn't count as "paying" in revenue-facing metrics)
      nonGrandfatheredActivePayingCount,
      payingByPlanGroup,
    ] = await Promise.all([
      // Total organizations
      this.prisma.organization.count({ where: nonTestOrgWhere }),

      // New orgs this week
      this.prisma.organization.count({
        where: { ...nonTestOrgWhere, createdAt: { gte: startOfWeek } },
      }),

      // New orgs this month
      this.prisma.organization.count({
        where: { ...nonTestOrgWhere, createdAt: { gte: currentPeriodStart, lte: currentPeriodEnd } },
      }),

      // Active orgs (have at least one invoice)
      this.prisma.organization.count({
        where: { ...nonTestOrgWhere, invoices: { some: {} } },
      }),

      // Total users
      this.prisma.user.count({ where: nonTestOrgRelationWhere }),

      // GMV - sum of invoice totals excluding draft/cancelled
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: {
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          deletedAt: null,
          ...nonTestOrgRelationWhere,
        },
      }),

      // Platform fee revenue
      this.prisma.payment.aggregate({
        _sum: { platformFees: true },
        where: nonTestOrgRelationWhere,
      }),

      // Invoice count by status
      this.prisma.invoice.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { total: true },
        where: { deletedAt: null, ...nonTestOrgRelationWhere },
      }),

      // Recent 10 signups (organizations) with user/invoice counts
      this.prisma.organization.findMany({
        where: nonTestOrgWhere,
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
        WHERE o.is_test_account = false
        GROUP BY o.id, o.name, o.slug, o.created_at, o.plan_tier, o.subscription_status, o.is_grandfathered
        ORDER BY volume DESC
        LIMIT 10
      `,

      // Orgs grouped by plan tier
      this.prisma.organization.groupBy({
        by: ['planTier'],
        _count: { id: true },
        where: nonTestOrgWhere,
      }),

      // Orgs grouped by subscription status
      this.prisma.organization.groupBy({
        by: ['subscriptionStatus'],
        _count: { id: true },
        where: nonTestOrgWhere,
      }),

      // Count of grandfathered orgs
      this.prisma.organization.count({
        where: { isGrandfathered: true, ...nonTestOrgWhere },
      }),

      // Total subscription payment revenue
      this.prisma.subscriptionPayment.aggregate({
        _sum: { amount: true },
        where: nonTestOrgRelationWhere,
      }),

      // Last month organizations
      this.prisma.organization.count({
        where: { ...nonTestOrgWhere, createdAt: { gte: priorPeriodStart, lte: priorPeriodEnd } },
      }),

      // Current month GMV
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: {
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          deletedAt: null,
          createdAt: { gte: currentPeriodStart, lte: currentPeriodEnd },
          ...nonTestOrgRelationWhere,
        },
      }),

      // Last month GMV
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: {
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          deletedAt: null,
          createdAt: { gte: priorPeriodStart, lte: priorPeriodEnd },
          ...nonTestOrgRelationWhere,
        },
      }),

      // Current month platform fees
      this.prisma.payment.aggregate({
        _sum: { platformFees: true },
        where: { createdAt: { gte: currentPeriodStart, lte: currentPeriodEnd }, ...nonTestOrgRelationWhere },
      }),

      // Last month platform fees
      this.prisma.payment.aggregate({
        _sum: { platformFees: true },
        where: { createdAt: { gte: priorPeriodStart, lte: priorPeriodEnd }, ...nonTestOrgRelationWhere },
      }),

      // Current month subscription payments (MRR proxy)
      this.prisma.subscriptionPayment.aggregate({
        _sum: { amount: true },
        where: { createdAt: { gte: currentPeriodStart, lte: currentPeriodEnd }, ...nonTestOrgRelationWhere },
      }),

      // Last month subscription payments
      this.prisma.subscriptionPayment.aggregate({
        _sum: { amount: true },
        where: { createdAt: { gte: priorPeriodStart, lte: priorPeriodEnd }, ...nonTestOrgRelationWhere },
      }),

      // ── Health metrics ──

      // Trials expiring this week (action list)
      this.prisma.organization.findMany({
        where: {
          ...nonTestOrgWhere,
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
          ...nonTestOrgWhere,
          subscriptionStatus: 'TRIALING',
          trialEndDate: { gte: now, lte: nextMonth },
        },
      }),

      // Monthly Active Tenants — orgs with at least 1 invoice in the last 30 days
      this.prisma.organization.count({
        where: {
          ...nonTestOrgWhere,
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
        where: { status: 'PAID', deletedAt: null, ...nonTestOrgRelationWhere },
      }),

      // Current month collected GMV
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: {
          status: 'PAID',
          deletedAt: null,
          createdAt: { gte: currentPeriodStart, lte: currentPeriodEnd },
          ...nonTestOrgRelationWhere,
        },
      }),

      // Last month collected GMV
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: {
          status: 'PAID',
          deletedAt: null,
          createdAt: { gte: priorPeriodStart, lte: priorPeriodEnd },
          ...nonTestOrgRelationWhere,
        },
      }),

      // Churned orgs (CANCELLED + EXPIRED)
      this.prisma.organization.count({
        where: {
          ...nonTestOrgWhere,
          subscriptionStatus: { in: ['CANCELLED', 'EXPIRED'] },
        },
      }),

      // Joint plan and status grouping for detailed breakdown
      this.prisma.organization.groupBy({
        by: ['planTier', 'subscriptionStatus'],
        _count: { id: true },
        where: nonTestOrgWhere,
      }),

      // Genuinely paying orgs — ACTIVE and not grandfathered
      this.prisma.organization.count({
        where: { subscriptionStatus: 'ACTIVE', isGrandfathered: false, ...nonTestOrgWhere },
      }),

      // Same, grouped by plan tier, for the Plan Distribution "paying" sub-label
      this.prisma.organization.groupBy({
        by: ['planTier'],
        where: { subscriptionStatus: 'ACTIVE', isGrandfathered: false, ...nonTestOrgWhere },
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

    // Genuinely paying orgs per plan (ACTIVE, excluding grandfathered) — for revenue-facing
    // "paying" labels, distinct from byPlanStatus[plan].ACTIVE which includes grandfathered orgs
    const payingByPlan = { FREE: 0, STARTER: 0, PRO: 0, BUSINESS: 0 };
    for (const item of payingByPlanGroup) {
      if (item.planTier in payingByPlan) {
        payingByPlan[item.planTier as keyof typeof payingByPlan] = item._count.id;
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
    // Excludes grandfathered orgs — they're exempt from billing, so shouldn't count as "paying"
    const activePayingOrgs = nonGrandfatheredActivePayingCount;
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
          where: { createdAt: { gte: m.start, lte: m.end }, ...nonTestOrgRelationWhere },
        }),
        this.prisma.invoice.aggregate({
          _sum: { total: true },
          where: {
            status: 'PAID',
            deletedAt: null,
            createdAt: { gte: m.start, lte: m.end },
            ...nonTestOrgRelationWhere,
          },
        }),
        this.prisma.organization.count({
          where: {
            ...nonTestOrgWhere,
            createdAt: { lte: m.end },
            planTier: { in: ['STARTER', 'PRO', 'BUSINESS'] },
            subscriptionStatus: 'ACTIVE',
          },
        }),
        this.prisma.organization.count({
          where: {
            ...nonTestOrgWhere,
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
        payingByPlan,
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

  /**
   * POS-side counterpart to getDashboard() — same shape (revenue, orders, health, top orgs,
   * trends), but scoped to Order/Printer/RestaurantTable instead of Invoice, and to
   * POS/BOTH orgs only. Deliberately does NOT repeat plan/subscription-status breakdowns
   * (trialing, churn, MRR) — those are platform-wide and already covered by getDashboard();
   * duplicating them per-module would double-count the same subscription.
   */
  async getPosDashboard(startDateStr?: string, endDateStr?: string) {
    const now = new Date();

    let currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let currentPeriodEnd = new Date(now);
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
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    // isTestAccount excludes the team's own internal/QA orgs from every POS metric below.
    const posOrgWhere = { enabledModules: { in: [OrgModule.POS, OrgModule.BOTH] }, isTestAccount: false };
    const nonCancelledOrderWhere = { status: { not: 'CANCELLED' as const } };

    const [
      totalPosOrgs,
      newPosOrgsThisWeek,
      newPosOrgsThisMonth,
      lastMonthPosOrgs,
      activePosOrgs,
      gmvResult,
      currentMonthGmvResult,
      lastMonthGmvResult,
      collectedGmvResult,
      currentMonthCollectedGmvResult,
      lastMonthCollectedGmvResult,
      ordersByStatus,
      ordersBySource,
      monthlyActiveTenantsCount,
      printerAdoptionCount,
      tableAdoptionCount,
      recentSignups,
      topOrganizations,
      avgFulfillmentResult,
    ] = await Promise.all([
      this.prisma.organization.count({ where: posOrgWhere }),

      this.prisma.organization.count({
        where: { ...posOrgWhere, createdAt: { gte: startOfWeek } },
      }),

      this.prisma.organization.count({
        where: { ...posOrgWhere, createdAt: { gte: currentPeriodStart, lte: currentPeriodEnd } },
      }),

      this.prisma.organization.count({
        where: { ...posOrgWhere, createdAt: { gte: priorPeriodStart, lte: priorPeriodEnd } },
      }),

      // Active POS orgs — placed at least one order, ever (mirrors invoicing's "has ≥1 invoice")
      this.prisma.organization.count({
        where: { ...posOrgWhere, orders: { some: {} } },
      }),

      // GMV — all non-cancelled order totals (an order can be CLOSED_UNPAID and still count as
      // volume moving through the org, same as invoicing counts SENT/OVERDUE invoices)
      this.prisma.order.aggregate({
        _sum: { total: true },
        where: { ...nonCancelledOrderWhere, organization: posOrgWhere },
      }),

      this.prisma.order.aggregate({
        _sum: { total: true },
        where: {
          ...nonCancelledOrderWhere,
          organization: posOrgWhere,
          createdAt: { gte: currentPeriodStart, lte: currentPeriodEnd },
        },
      }),

      this.prisma.order.aggregate({
        _sum: { total: true },
        where: {
          ...nonCancelledOrderWhere,
          organization: posOrgWhere,
          createdAt: { gte: priorPeriodStart, lte: priorPeriodEnd },
        },
      }),

      // Collected GMV — CLOSED_PAID only (cash actually taken), mirrors invoicing's "PAID invoices"
      this.prisma.order.aggregate({
        _sum: { total: true },
        where: { status: 'CLOSED_PAID', organization: posOrgWhere },
      }),

      this.prisma.order.aggregate({
        _sum: { total: true },
        where: {
          status: 'CLOSED_PAID',
          organization: posOrgWhere,
          createdAt: { gte: currentPeriodStart, lte: currentPeriodEnd },
        },
      }),

      this.prisma.order.aggregate({
        _sum: { total: true },
        where: {
          status: 'CLOSED_PAID',
          organization: posOrgWhere,
          createdAt: { gte: priorPeriodStart, lte: priorPeriodEnd },
        },
      }),

      this.prisma.order.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { total: true },
        where: { organization: posOrgWhere },
      }),

      this.prisma.order.groupBy({
        by: ['source'],
        _count: { id: true },
        where: { organization: posOrgWhere },
      }),

      // Monthly Active Tenants — POS orgs with at least 1 order in the last 30 days
      this.prisma.organization.count({
        where: { ...posOrgWhere, orders: { some: { createdAt: { gte: thirtyDaysAgo } } } },
      }),

      // Adoption: has the org actually set up a printer / a table, or just flipped the module on?
      this.prisma.organization.count({
        where: { ...posOrgWhere, printers: { some: { isActive: true } } },
      }),

      this.prisma.organization.count({
        where: { ...posOrgWhere, restaurantTables: { some: {} } },
      }),

      this.prisma.organization.findMany({
        where: posOrgWhere,
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
          _count: { select: { users: true, orders: true } },
        },
      }),

      // Top 10 POS orgs by collected (CLOSED_PAID) order volume
      this.prisma.$queryRaw<
        Array<{
          id: string;
          name: string;
          slug: string;
          createdAt: Date;
          userCount: number;
          orderCount: number;
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
          COUNT(DISTINCT ord.id)::int AS "orderCount",
          COALESCE(SUM(ord.total), 0)::float8 AS volume
        FROM organizations o
        LEFT JOIN users u ON u.organization_id = o.id
        LEFT JOIN orders ord ON ord.organization_id = o.id AND ord.status = 'CLOSED_PAID'
        WHERE o.enabled_modules IN ('POS', 'BOTH') AND o.is_test_account = false
        GROUP BY o.id, o.name, o.slug, o.created_at, o.plan_tier, o.subscription_status, o.is_grandfathered
        ORDER BY volume DESC
        LIMIT 10
      `,

      // Average time from order placed to order closed+paid this month, in minutes — a proxy
      // for how smoothly an org's floor/kitchen is actually running.
      this.prisma.$queryRaw<Array<{ avgMinutes: number | null }>>`
        SELECT AVG(EXTRACT(EPOCH FROM (ord.closed_at - ord.created_at)) / 60)::float8 AS "avgMinutes"
        FROM orders ord
        JOIN organizations o ON o.id = ord.organization_id
        WHERE ord.status = 'CLOSED_PAID'
          AND ord.closed_at IS NOT NULL
          AND o.enabled_modules IN ('POS', 'BOTH')
          AND o.is_test_account = false
          AND ord.created_at >= ${currentPeriodStart}
          AND ord.created_at <= ${currentPeriodEnd}
      `,
    ]);

    const orgsMoMChange = this.calculateMoMChange(newPosOrgsThisMonth, lastMonthPosOrgs);

    const curMonthGmv = Number(currentMonthGmvResult._sum.total) || 0;
    const prevMonthGmv = Number(lastMonthGmvResult._sum.total) || 0;
    const gmvMoMChange = this.calculateMoMChange(curMonthGmv, prevMonthGmv);

    const curMonthCollectedGmv = Number(currentMonthCollectedGmvResult._sum.total) || 0;
    const prevMonthCollectedGmv = Number(lastMonthCollectedGmvResult._sum.total) || 0;
    const collectedGmvChangePct = this.calculateMoMChange(curMonthCollectedGmv, prevMonthCollectedGmv);

    const monthlyActiveTenantsRate =
      totalPosOrgs > 0 ? Number(((monthlyActiveTenantsCount / totalPosOrgs) * 100).toFixed(1)) : 0;
    const printerAdoptionRate =
      totalPosOrgs > 0 ? Number(((printerAdoptionCount / totalPosOrgs) * 100).toFixed(1)) : 0;
    const tableAdoptionRate =
      totalPosOrgs > 0 ? Number(((tableAdoptionCount / totalPosOrgs) * 100).toFixed(1)) : 0;

    const orderStatusBreakdown = ordersByStatus.reduce(
      (acc, item) => {
        acc[item.status] = { count: item._count.id, total: Number(item._sum.total) || 0 };
        return acc;
      },
      {} as Record<string, { count: number; total: number }>,
    );

    const orderSourceBreakdown = ordersBySource.reduce(
      (acc, item) => {
        acc[item.source] = item._count.id;
        return acc;
      },
      {} as Record<string, number>,
    );

    const trendMonths: Array<{ start: Date; end: Date; label: string }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      trendMonths.push({ start, end, label: d.toLocaleString('en-US', { month: 'short' }) });
    }

    const trends = await Promise.all(
      trendMonths.map(async (m) => {
        const [collectedGmvAgg, orderCountResult, activeTenantsCount] = await Promise.all([
          this.prisma.order.aggregate({
            _sum: { total: true },
            where: { status: 'CLOSED_PAID', organization: posOrgWhere, createdAt: { gte: m.start, lte: m.end } },
          }),
          this.prisma.order.count({
            where: { organization: posOrgWhere, createdAt: { gte: m.start, lte: m.end } },
          }),
          this.prisma.organization.count({
            where: { ...posOrgWhere, orders: { some: { createdAt: { gte: m.start, lte: m.end } } } },
          }),
        ]);

        return {
          month: m.label,
          collectedGmv: Number(collectedGmvAgg._sum.total) || 0,
          orderCount: orderCountResult,
          activeTenants: activeTenantsCount,
        };
      }),
    );

    return {
      organizations: {
        total: totalPosOrgs,
        newThisWeek: newPosOrgsThisWeek,
        newThisMonth: newPosOrgsThisMonth,
        active: activePosOrgs,
        inactive: totalPosOrgs - activePosOrgs,
        lastMonth: lastMonthPosOrgs,
        changePct: orgsMoMChange,
      },
      revenue: {
        gmv: Number(gmvResult._sum.total) || 0,
        gmvCurrentMonth: curMonthGmv,
        gmvPreviousMonth: prevMonthGmv,
        gmvChangePct: gmvMoMChange,
        collectedGmv: Number(collectedGmvResult._sum.total) || 0,
        collectedGmvCurrentMonth: curMonthCollectedGmv,
        collectedGmvPreviousMonth: prevMonthCollectedGmv,
        collectedGmvChangePct,
      },
      orders: {
        byStatus: orderStatusBreakdown,
        bySource: orderSourceBreakdown,
      },
      health: {
        monthlyActiveTenants: monthlyActiveTenantsCount,
        monthlyActiveTenantsRate,
        printerAdoption: printerAdoptionCount,
        printerAdoptionRate,
        tableAdoption: tableAdoptionCount,
        tableAdoptionRate,
        avgFulfillmentMinutes: Number(avgFulfillmentResult[0]?.avgMinutes) || 0,
      },
      recentSignups: recentSignups.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        userCount: org._count.users,
        orderCount: org._count.orders,
        createdAt: org.createdAt,
        planTier: org.planTier,
        subscriptionStatus: org.subscriptionStatus,
        isGrandfathered: org.isGrandfathered,
      })),
      topOrganizations: topOrganizations.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        userCount: org.userCount,
        orderCount: org.orderCount,
        volume: org.volume,
        createdAt: org.createdAt,
        planTier: org.planTier,
        subscriptionStatus: org.subscriptionStatus,
        isGrandfathered: org.isGrandfathered,
      })),
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
          isTestAccount: true,
          platformFeePercent: true,
          enabledModules: true,
          trialStartDate: true,
          trialEndDate: true,
          subscriptionStartDate: true,
          createdAt: true,
          _count: {
            select: {
              users: true,
              invoices: true,
              orders: true,
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
        orderCount: org._count.orders,
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
            roles: true,
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
    enabledModules?: OrgModule;
    isTestAccount?: boolean;
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

    if (data.enabledModules !== undefined) {
      updateData.enabledModules = data.enabledModules;
    }

    if (data.isTestAccount !== undefined) {
      updateData.isTestAccount = data.isTestAccount;
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

  /**
   * Vendor subaccounts stuck in PENDING/FAILED across all organizations — Paystack has no
   * webhook or API field for when a new subaccount clears its first-payout review, so this
   * is the queue platform staff work through manually after checking the Paystack dashboard.
   */
  async getPendingVendorPayouts() {
    const vendors = await this.prisma.vendor.findMany({
      where: { paystackSubaccountStatus: { in: ['PENDING', 'FAILED'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        bankName: true,
        bankAccountNumber: true,
        paystackSubaccountCode: true,
        paystackSubaccountStatus: true,
        createdAt: true,
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    return vendors;
  }

  /**
   * Marks a vendor's subaccount ACTIVE after platform staff have manually verified it in
   * the Paystack Dashboard. Note Paystack's own confirmed behavior: payouts only resume
   * "starting the next day" after verification, even once this is marked active here.
   */
  async activateVendorPayout(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    if (!vendor.paystackSubaccountCode) {
      throw new BadRequestException('Vendor has no Paystack subaccount to activate');
    }

    return this.prisma.vendor.update({
      where: { id: vendorId },
      data: { paystackSubaccountStatus: 'ACTIVE' },
    });
  }
}
