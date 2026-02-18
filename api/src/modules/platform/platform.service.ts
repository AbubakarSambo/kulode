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
        include: {
          _count: {
            select: { users: true, invoices: true },
          },
        },
      }),

      // Top 10 organizations by invoice volume
      this.prisma.organization.findMany({
        take: 10,
        include: {
          _count: {
            select: { invoices: true, users: true },
          },
          invoices: {
            where: {
              status: { notIn: ['DRAFT', 'CANCELLED'] },
              deletedAt: null,
            },
            select: { total: true },
          },
        },
      }),
    ]);

    // Process top organizations to calculate volume
    const topOrgsByVolume = topOrganizations
      .map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        userCount: org._count.users,
        invoiceCount: org._count.invoices,
        volume: org.invoices.reduce((sum, inv) => sum + Number(inv.total), 0),
        createdAt: org.createdAt,
      }))
      .sort((a, b) => b.volume - a.volume);

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
      recentSignups: recentSignups.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        userCount: org._count.users,
        invoiceCount: org._count.invoices,
        createdAt: org.createdAt,
      })),
      topOrganizations: topOrgsByVolume,
    };
  }
}
