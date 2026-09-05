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

    const [sales, prevSales, orderCount, closedPaidAgg, closedUnpaidAgg, openAgg, byMethod, bySource, topItems, topStaff] = await Promise.all([
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
      this.prisma.order.aggregate({
        where: { organizationId, status: OrderStatus.CLOSED_PAID, closedAt: { gte: startDate, lte: endDate } },
        _count: true,
        _sum: { total: true },
      }),
      this.prisma.order.aggregate({
        where: { organizationId, status: OrderStatus.CLOSED_UNPAID, closedAt: { gte: startDate, lte: endDate } },
        _count: true,
        _sum: { total: true, amountPaid: true },
      }),
      // Open orders have no closedAt to bucket by, so this is a live snapshot of what's
      // currently open — not scoped to the selected period like the closed buckets above.
      this.prisma.order.aggregate({
        where: { organizationId, status: { in: [OrderStatus.OPEN, OrderStatus.IN_KITCHEN, OrderStatus.READY] } },
        _count: true,
        _sum: { total: true },
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
      // order.source, not payment.paymentMethod — a sale's "source" (dine-in/takeaway/delivery/
      // etc.) is an attribute of the order itself, not of how it was paid for.
      this.prisma.order.groupBy({
        by: ['source'],
        where: { organizationId, ...closedOrderFilter, closedAt: { gte: startDate, lte: endDate } },
        _sum: { total: true },
        _count: true,
        orderBy: { _sum: { total: 'desc' } },
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

    const closedPaidTotal = Number(closedPaidAgg._sum.total || 0);
    const closedUnpaidTotal = Number(closedUnpaidAgg._sum.total || 0);
    const closedUnpaidCollected = Number(closedUnpaidAgg._sum.amountPaid || 0);
    const openTotal = Number(openAgg._sum.total || 0);

    return {
      period: { startDate, endDate },
      sales: {
        total: totalSales,
        change: this.calculatePercentageChange(totalSales, prevTotalSales),
        paymentCount: sales._count,
      },
      orderCount,
      avgOrderValue: orderCount > 0 ? totalSales / orderCount : 0,
      // Powers the composite Orders card: Total = closed (paid + unpaid) + currently-open, so a
      // period with a lot of unpaid or still-open orders doesn't just look like "low sales."
      orderBreakdown: {
        total: closedPaidAgg._count + closedUnpaidAgg._count + openAgg._count,
        closedPaid: { count: closedPaidAgg._count, amount: closedPaidTotal },
        closedUnpaid: {
          count: closedUnpaidAgg._count,
          amount: closedUnpaidTotal,
          outstanding: closedUnpaidTotal - closedUnpaidCollected,
        },
        // Live snapshot, not period-scoped — see the query above.
        open: { count: openAgg._count, amount: openTotal },
      },
      byPaymentMethod: byMethod.map((m) => ({
        method: m.paymentMethod,
        total: Number(m._sum.amount || 0),
        count: m._count,
      })),
      byOrderType: bySource.map((s) => ({
        type: s.source,
        total: Number(s._sum.total || 0),
        count: s._count,
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

    // A single business day (Today/Yesterday, or a one-day Custom range) has nothing to show a
    // day-over-day trend across — bucketing it by day would always collapse to one point, and
    // the dashboard hides the whole card rather than plot a "trend" with nothing to compare
    // against. Bucket by hour within the shift instead so it still shows something meaningful
    // (e.g. the lunch vs. dinner rush). 25h (not 24h) gives slack for an overnight shift whose
    // configured end time sits a few minutes past its start time on the clock.
    const isSingleBusinessDay = endDate.getTime() - startDate.getTime() <= 25 * 60 * 60 * 1000;
    if (isSingleBusinessDay) {
      const hourly = await this.prisma.$queryRaw<{ bucket: Date; total: number; count: number }[]>`
        SELECT
          DATE_TRUNC('hour', o.closed_at) as bucket,
          SUM(p.amount)::numeric as total,
          COUNT(*)::integer as count
        FROM payments p
        JOIN orders o ON o.id = p.order_id
        WHERE p.organization_id = ${organizationId}
          AND o.status IN ('CLOSED_PAID', 'CLOSED_UNPAID')
          AND o.closed_at >= ${startDate}
          AND o.closed_at <= ${endDate}
        GROUP BY bucket
        ORDER BY bucket
      `;

      return {
        period: { startDate, endDate },
        // Sorted by the real timestamp above (correct even across a midnight-crossing shift),
        // then rendered here as a bare "HH:00" label — the date part would just repeat/flip
        // partway through and add nothing useful within a single shift. UTC hours specifically:
        // this reads back whatever absolute instant DATE_TRUNC produced, independent of the
        // Node process's local TZ setting.
        daily: hourly.map((h) => ({
          day: `${String(new Date(h.bucket).getUTCHours()).padStart(2, '0')}:00`,
          total: Number(h.total),
          count: Number(h.count),
        })),
      };
    }

    const shift = await this.getOrgShiftHours(organizationId);
    // "HH:mm" -> "HH:mm:00", a valid Postgres interval literal.
    const shiftStartInterval = `${shift.shiftStartTime}:00`;

    // Bucketed by the order's closed_at (not the payment's own payment_date) so the trend line
    // sums to the same totals getSummary reports for the same range — see the comment there.
    //
    // Bucketed by *business* day, not literal calendar date: this org's day is anchored on its
    // shift hours (e.g. 05:00 -> 04:59 the next calendar date), same convention as
    // applyShiftHours/getDateRange above. Grouping by the raw date instead would split one
    // overnight shift's sales across the midnight boundary into two lopsided buckets — for a
    // single-business-day period like "Yesterday" that's not a trend at all, just two arbitrary
    // fragments of the same shift rendered as if they were separate days.
    // Grouped by the "day" output alias, not by repeating the TO_CHAR(...) expression a second
    // time — each textual occurrence of an interpolated value becomes its own bound parameter,
    // so a repeated expression binds two separate parameters for what's really the same literal
    // value, and Postgres's GROUP BY validity check doesn't know they'll always match at
    // execution time. Postgres explicitly allows grouping by an output column alias, so this
    // sidesteps the issue rather than fighting it.
    const daily = await this.prisma.$queryRaw<{ day: string; total: number; count: number }[]>`
      SELECT
        TO_CHAR(o.closed_at - ${shiftStartInterval}::interval, 'YYYY-MM-DD') as day,
        SUM(p.amount)::numeric as total,
        COUNT(*)::integer as count
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      WHERE p.organization_id = ${organizationId}
        AND o.status IN ('CLOSED_PAID', 'CLOSED_UNPAID')
        AND o.closed_at >= ${startDate}
        AND o.closed_at <= ${endDate}
      GROUP BY day
      ORDER BY day
    `;

    return {
      period: { startDate, endDate },
      daily: daily.map((d) => ({ day: d.day, total: Number(d.total), count: Number(d.count) })),
    };
  }
}
