import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { applyShiftHours, DEFAULT_SHIFT_HOURS, ShiftHours } from '../../common';
import { ReportFilterDto, ReportPeriod } from '../reports/dto';

@Injectable()
export class PosDashboardService {
  constructor(private prisma: PrismaService) {}

  private async getOrgShiftHours(organizationId: string): Promise<ShiftHours> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { shiftStartTime: true, shiftEndTime: true },
    });
    return org ?? DEFAULT_SHIFT_HOURS;
  }

  private async getDateRange(organizationId: string, filter: ReportFilterDto): Promise<{ startDate: Date; endDate: Date }> {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    switch (filter.period) {
      case ReportPeriod.TODAY:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case ReportPeriod.YESTERDAY: {
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        startDate = yesterday;
        endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
        break;
      }
      case ReportPeriod.LAST_WEEK: {
        // Sunday-start weeks, matching the convention used elsewhere in this app.
        const startOfThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        startDate = new Date(startOfThisWeek.getFullYear(), startOfThisWeek.getMonth(), startOfThisWeek.getDate() - 7);
        endDate = new Date(startOfThisWeek.getFullYear(), startOfThisWeek.getMonth(), startOfThisWeek.getDate() - 1, 23, 59, 59);
        break;
      }
      case ReportPeriod.LAST_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        break;
      case ReportPeriod.THIS_QUARTER: {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
        break;
      }
      case ReportPeriod.LAST_QUARTER: {
        const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
        const year = lastQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const quarter = lastQuarter < 0 ? 3 : lastQuarter;
        startDate = new Date(year, quarter * 3, 1);
        endDate = new Date(year, (quarter + 1) * 3, 0, 23, 59, 59);
        break;
      }
      case ReportPeriod.THIS_YEAR:
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case ReportPeriod.LAST_YEAR:
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
        break;
      case ReportPeriod.CUSTOM: {
        // Normalize to local calendar-day bounds — filter.startDate/endDate come from a
        // date-only picker, so they parse to midnight. Using them as-is would make a
        // "today to today" range a near-zero-width [midnight, midnight] window instead of
        // covering the whole day.
        const customStart = filter.startDate ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const customEnd = filter.endDate ?? now;
        startDate = new Date(customStart.getFullYear(), customStart.getMonth(), customStart.getDate());
        endDate = new Date(customEnd.getFullYear(), customEnd.getMonth(), customEnd.getDate(), 23, 59, 59);
        break;
      }
      case ReportPeriod.THIS_MONTH:
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const shift = await this.getOrgShiftHours(organizationId);
    return applyShiftHours(startDate, endDate, shift);
  }

  private getPreviousDateRange(startDate: Date, endDate: Date): { startDate: Date; endDate: Date } {
    const diffTime = endDate.getTime() - startDate.getTime();
    return {
      startDate: new Date(startDate.getTime() - diffTime),
      endDate: new Date(startDate.getTime() - 1),
    };
  }

  private calculatePercentageChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(2));
  }

  async getSummary(organizationId: string, filter: ReportFilterDto) {
    const { startDate, endDate } = await this.getDateRange(organizationId, filter);
    const prevRange = this.getPreviousDateRange(startDate, endDate);

    // Sales/byPaymentMethod are keyed off the *order's* closedAt (not the payment's own
    // paymentDate) and restricted to actually-closed orders — the same universe orderCount,
    // topItems and topStaff use below. Otherwise a partial payment recorded against an order
    // that's still OPEN (or was later reopened, clearing closedAt) would inflate "Sales" for a
    // period that shows 0 orders, since payment.paymentDate and order.closedAt can diverge.
    const closedOrderFilter = {
      status: { in: [OrderStatus.CLOSED_PAID, OrderStatus.CLOSED_UNPAID] },
    };

    const [sales, prevSales, orderCount, byMethod, topItems, topStaff] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          organizationId,
          orderId: { not: null },
          order: { ...closedOrderFilter, closedAt: { gte: startDate, lte: endDate } },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: {
          organizationId,
          orderId: { not: null },
          order: { ...closedOrderFilter, closedAt: { gte: prevRange.startDate, lte: prevRange.endDate } },
        },
        _sum: { amount: true },
      }),
      this.prisma.order.count({
        where: {
          organizationId,
          status: { in: ['CLOSED_PAID', 'CLOSED_UNPAID'] },
          closedAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.payment.groupBy({
        by: ['paymentMethod'],
        where: {
          organizationId,
          orderId: { not: null },
          order: { ...closedOrderFilter, closedAt: { gte: startDate, lte: endDate } },
        },
        _sum: { amount: true },
        _count: true,
        // Descending by total — the client reads index 0 as "Top Method", so order matters here.
        orderBy: { _sum: { amount: 'desc' } },
      }),
      this.prisma.$queryRaw<{ id: string; name: string; quantity: number; revenue: number; orders: number }[]>`
        SELECT
          oi.menu_item_id as id,
          mi.name as name,
          SUM(oi.quantity)::numeric as quantity,
          SUM(oi.amount)::numeric as revenue,
          COUNT(DISTINCT oi.order_id)::integer as orders
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.organization_id = ${organizationId}
          AND o.status IN ('CLOSED_PAID', 'CLOSED_UNPAID')
          AND o.closed_at >= ${startDate}
          AND o.closed_at <= ${endDate}
        GROUP BY oi.menu_item_id, mi.name
        ORDER BY revenue DESC
        LIMIT 10
      `,
      // Attributed to the waiter when one's assigned, else whoever created the order (e.g. a
      // cashier ringing up a walk-in with no waiter) — every closed order has a createdById, so
      // this sums to the same total as the orders count above, unlike a waiter-only breakdown.
      this.prisma.$queryRaw<{ id: string; name: string; revenue: number; orders: number }[]>`
        SELECT
          COALESCE(o.waiter_id, o.created_by) as id,
          u.first_name || ' ' || u.last_name as name,
          SUM(o.total)::numeric as revenue,
          COUNT(*)::integer as orders
        FROM orders o
        JOIN users u ON u.id = COALESCE(o.waiter_id, o.created_by)
        WHERE o.organization_id = ${organizationId}
          AND o.status IN ('CLOSED_PAID', 'CLOSED_UNPAID')
          AND o.closed_at >= ${startDate}
          AND o.closed_at <= ${endDate}
        GROUP BY COALESCE(o.waiter_id, o.created_by), u.first_name, u.last_name
        ORDER BY revenue DESC
        LIMIT 10
      `,
    ]);

    const totalSales = Number(sales._sum.amount || 0);
    const prevTotalSales = Number(prevSales._sum.amount || 0);

    return {
      period: { startDate, endDate },
      sales: {
        total: totalSales,
        change: this.calculatePercentageChange(totalSales, prevTotalSales),
        paymentCount: sales._count,
      },
      orderCount,
      avgOrderValue: orderCount > 0 ? totalSales / orderCount : 0,
      byPaymentMethod: byMethod.map((m) => ({
        method: m.paymentMethod,
        total: Number(m._sum.amount || 0),
        count: m._count,
      })),
      topItems: topItems.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: Number(i.quantity),
        revenue: Number(i.revenue),
        orders: Number(i.orders),
      })),
      topStaff: topStaff.map((w) => ({
        id: w.id,
        name: w.name,
        revenue: Number(w.revenue),
        orders: Number(w.orders),
      })),
    };
  }

  async getTrend(organizationId: string, filter: ReportFilterDto) {
    const { startDate, endDate } = await this.getDateRange(organizationId, filter);

    // Bucketed by the order's closed_at (not the payment's own payment_date) so the trend line
    // sums to the same totals getSummary reports for the same range — see the comment there.
    const daily = await this.prisma.$queryRaw<{ day: string; total: number; count: number }[]>`
      SELECT
        TO_CHAR(o.closed_at, 'YYYY-MM-DD') as day,
        SUM(p.amount)::numeric as total,
        COUNT(*)::integer as count
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      WHERE p.organization_id = ${organizationId}
        AND o.status IN ('CLOSED_PAID', 'CLOSED_UNPAID')
        AND o.closed_at >= ${startDate}
        AND o.closed_at <= ${endDate}
      GROUP BY TO_CHAR(o.closed_at, 'YYYY-MM-DD')
      ORDER BY day
    `;

    return {
      period: { startDate, endDate },
      daily: daily.map((d) => ({ day: d.day, total: Number(d.total), count: Number(d.count) })),
    };
  }
}
