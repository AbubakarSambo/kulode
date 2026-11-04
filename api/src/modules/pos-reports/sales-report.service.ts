import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { applyShiftHours, dateAtTime, DEFAULT_SHIFT_HOURS } from '../../common';
import { buildSalesReport, CatalogItem, DepartmentKey, ReportLine } from './sales-report.builder';

const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));
const DAY_MS = 24 * 60 * 60 * 1000;

interface CategoryInfo {
  name: string;
  department: DepartmentKey;
  size: number;
  sortOrder: number;
}

interface RangeQuery {
  from: string;
  to?: string;
  fromTime?: string;
  toTime?: string;
  compare?: CompareBasis;
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS) + 1;
}

export type CompareBasis = 'week' | 'month';

/**
 * The period a report is compared against. "month" (or any range over a week that starts on the
 * 1st and stays in one month) compares with the same dates last month; "week", a single day or
 * any range up to a week compares with the same weekdays a week earlier; anything longer with the
 * equally long period just before it.
 */
export function comparisonRange(from: string, to: string, basis?: CompareBasis): { from: string; to: string; label: string } {
  const days = daysBetween(from, to);
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const sameMonthFromFirst = fd === 1 && fy === ty && fm === tm;
  if (basis !== 'week' && sameMonthFromFirst && (basis === 'month' || days > 7)) {
    const prevMonthDays = new Date(Date.UTC(fy, fm - 1, 0)).getUTCDate();
    const start = new Date(Date.UTC(fy, fm - 2, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(fy, fm - 2, Math.min(td, prevMonthDays))).toISOString().slice(0, 10);
    return { from: start, to: end, label: 'same dates last month' };
  }
  if (days <= 7) {
    return { from: addDays(from, -7), to: addDays(to, -7), label: days === 1 ? 'same weekday last week' : 'same days last week' };
  }
  return { from: addDays(from, -days), to: addDays(to, -days), label: `previous ${days} days` };
}

/**
 * The POS sales report: headline numbers with a comparison, Department › Category › Item
 * breakdown, top/bottom items, dayparts, order types, payments, staff and the void/discount
 * control block. See sales-report.builder.ts for the definitions of gross, net and voids.
 */
@Injectable()
export class SalesReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getSalesReport(organizationId: string, query: RangeQuery, waiterId?: string) {
    const to = query.to ?? query.from;
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, posMode: true, shiftStartTime: true, shiftEndTime: true },
    });
    const shift = org ?? DEFAULT_SHIFT_HOURS;
    const window = (from: string, until: string) => {
      const base = applyShiftHours(new Date(from), new Date(until), shift);
      return {
        startDate: query.fromTime ? dateAtTime(new Date(from), query.fromTime) : base.startDate,
        endDate: query.toTime ? dateAtTime(new Date(until), query.toTime, true) : base.endDate,
      };
    };
    const period = window(query.from, to);
    const cmp = comparisonRange(query.from, to, query.compare);
    const cmpPeriod = window(cmp.from, cmp.to);
    const staffFilter = waiterId ? { waiterId } : {};

    const [orders, voided, categories, menuItems, storeItems, users, cmpSales, cmpOrders] = await Promise.all([
      this.prisma.order.findMany({
        where: { organizationId, status: OrderStatus.CLOSED_PAID, closedAt: { gte: period.startDate, lte: period.endDate }, ...staffFilter },
        select: {
          createdAt: true,
          source: true,
          waiterId: true,
          createdById: true,
          discountAmount: true,
          items: { select: { menuItemId: true, inventoryItemId: true, itemName: true, quantity: true, amount: true } },
          payments: { select: { paymentMethod: true, amount: true } },
        },
      }),
      this.prisma.order.findMany({
        where: { organizationId, status: OrderStatus.CANCELLED, createdAt: { gte: period.startDate, lte: period.endDate }, ...staffFilter },
        select: { waiterId: true, createdById: true, items: { select: { amount: true } } },
      }),
      this.prisma.menuCategory.findMany({
        where: { organizationId },
        select: { id: true, name: true, kind: true, sortOrder: true, _count: { select: { menuItems: true } } },
      }),
      this.prisma.menuItem.findMany({
        where: { organizationId },
        select: { id: true, isAvailable: true, categories: { select: { categoryId: true } } },
      }),
      this.prisma.inventoryItem.findMany({
        where: { organizationId, sellPrice: { not: null } },
        select: { id: true, department: true, isActive: true },
      }),
      this.prisma.user.findMany({ where: { organizationId }, select: { id: true, firstName: true, lastName: true } }),
      this.prisma.orderItem.aggregate({
        _sum: { amount: true },
        where: { order: { organizationId, status: OrderStatus.CLOSED_PAID, closedAt: { gte: cmpPeriod.startDate, lte: cmpPeriod.endDate }, ...staffFilter } },
      }),
      this.prisma.order.count({
        where: { organizationId, status: OrderStatus.CLOSED_PAID, closedAt: { gte: cmpPeriod.startDate, lte: cmpPeriod.endDate }, ...staffFilter },
      }),
    ]);

    const categoryInfo = new Map<string, CategoryInfo>(
      categories.map((c) => [c.id, { name: c.name, department: c.kind, size: c._count.menuItems, sortOrder: c.sortOrder }]),
    );
    const menuItemCategory = new Map<string, CategoryInfo | undefined>(
      menuItems.map((m) => [m.id, mostSpecificCategory(m.categories.map((c) => categoryInfo.get(c.categoryId)))]),
    );
    const storeDepartment = new Map(storeItems.map((i) => [i.id, i.department?.trim() || 'Uncategorized']));

    const resolveLine = (item: (typeof orders)[number]['items'][number]): ReportLine => {
      const base = { itemName: item.itemName, quantity: num(item.quantity), amount: num(item.amount) };
      if (item.menuItemId) {
        const cat = menuItemCategory.get(item.menuItemId);
        return { ...base, itemKey: `m:${item.menuItemId}`, category: cat?.name ?? 'Uncategorized', department: cat?.department ?? 'OTHER' };
      }
      if (item.inventoryItemId) {
        return {
          ...base,
          itemKey: `i:${item.inventoryItemId}`,
          category: storeDepartment.get(item.inventoryItemId) ?? 'Uncategorized',
          department: 'STORE',
        };
      }
      // The menu item was deleted after the sale: still counted, under its name.
      return { ...base, itemKey: `n:${item.itemName}`, category: 'Uncategorized', department: 'OTHER' };
    };

    const catalog: CatalogItem[] = [
      ...menuItems
        .filter((m) => m.isAvailable)
        .map((m) => ({ itemKey: `m:${m.id}`, department: menuItemCategory.get(m.id)?.department ?? 'OTHER' })),
      ...(org?.posMode === 'RETAIL'
        ? storeItems.filter((i) => i.isActive).map((i) => ({ itemKey: `i:${i.id}`, department: 'STORE' as const }))
        : []),
    ];

    const body = buildSalesReport({
      orders: orders.map((o) => ({
        placedAt: o.createdAt,
        orderType: o.source,
        staffId: o.waiterId ?? o.createdById,
        discountAmount: num(o.discountAmount),
        lines: o.items.map(resolveLine),
        payments: o.payments.map((p) => ({ method: p.paymentMethod, amount: num(p.amount) })),
      })),
      voids: voided.map((v) => ({ staffId: v.waiterId ?? v.createdById, amount: v.items.reduce((s, i) => s + num(i.amount), 0) })),
      catalog,
      staffNames: new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()])),
    });

    const previousSales = num(cmpSales._sum.amount);
    return {
      organizationName: org?.name ?? '',
      from: query.from,
      to,
      period,
      comparison: {
        label: cmp.label,
        from: cmp.from,
        to: cmp.to,
        grossSales: Math.round(previousSales * 100) / 100,
        orders: cmpOrders,
        changePercent: previousSales > 0 ? Math.round(((body.headline.grossSales - previousSales) / previousSales) * 1000) / 10 : null,
      },
      ...body,
    };
  }
}

/**
 * Menu items are often filed under a broad category and a specific one ("Kitchen" + "Eat Up!").
 * A sale counts once, under the most specific: the category holding the fewest items, then the
 * earliest in menu order, then by name.
 */
export function mostSpecificCategory(candidates: Array<CategoryInfo | undefined>): CategoryInfo | undefined {
  return candidates
    .filter((c): c is CategoryInfo => !!c)
    .sort((a, b) => a.size - b.size || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))[0];
}
