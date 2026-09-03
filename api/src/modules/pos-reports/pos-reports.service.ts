import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { applyShiftHours, dateAtTime, DEFAULT_SHIFT_HOURS, ShiftHours } from '../../common';

function toNumber(val: Prisma.Decimal | number): number {
  return typeof val === 'number' ? val : Number(val);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class PosReportsService {
  constructor(private prisma: PrismaService) {}

  private async getOrgShiftHours(organizationId: string): Promise<ShiftHours> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { shiftStartTime: true, shiftEndTime: true },
    });
    return org ?? DEFAULT_SHIFT_HOURS;
  }

  /**
   * Mirrors a POS Z-report: sales/quantity by menu category, per-product totals, and
   * order/cashier counts, for an inclusive day (or day range). Only fully paid orders count
   * as "sales" — CLOSED_UNPAID orders never get a closedAt, so they fall outside any range.
   */
  async getItemSalesReport(organizationId: string, from: string, to?: string, fromTime?: string, toTime?: string) {
    const rangeEnd = to ?? from;
    const shift = await this.getOrgShiftHours(organizationId);
    // fromTime/toTime let a user drill into a specific window within the range (e.g. "6am-2pm on
    // Sep 3") instead of always getting the org's full shift day — each falls back independently
    // to the shift boundary for that side when not given.
    const { startDate: shiftStart, endDate: shiftEnd } = applyShiftHours(new Date(from), new Date(rangeEnd), shift);
    const startDate = fromTime ? dateAtTime(new Date(from), fromTime) : shiftStart;
    const endDate = toTime ? dateAtTime(new Date(rangeEnd), toTime, true) : shiftEnd;

    const orders = await this.prisma.order.findMany({
      where: {
        organizationId,
        status: OrderStatus.CLOSED_PAID,
        closedAt: { gte: startDate, lte: endDate },
      },
      select: {
        id: true,
        items: {
          select: {
            itemName: true,
            quantity: true,
            amount: true,
            menuItem: {
              select: {
                categories: { take: 1, select: { category: { select: { name: true } } } },
              },
            },
          },
        },
        payments: { select: { recordedBy: { select: { firstName: true, lastName: true } } } },
      },
    });

    const categoryAmount = new Map<string, number>();
    const categoryQuantity = new Map<string, number>();
    const products = new Map<string, { quantity: number; amount: number }>();
    const cashiers = new Set<string>();
    let totalSales = 0;
    let totalQuantity = 0;

    for (const order of orders) {
      for (const item of order.items) {
        const categoryName = item.menuItem?.categories[0]?.category.name ?? 'Uncategorized';
        const amount = toNumber(item.amount);
        const quantity = toNumber(item.quantity);

        categoryAmount.set(categoryName, (categoryAmount.get(categoryName) ?? 0) + amount);
        categoryQuantity.set(categoryName, (categoryQuantity.get(categoryName) ?? 0) + quantity);

        const product = products.get(item.itemName) ?? { quantity: 0, amount: 0 };
        product.quantity += quantity;
        product.amount += amount;
        products.set(item.itemName, product);

        totalSales += amount;
        totalQuantity += quantity;
      }

      for (const payment of order.payments) {
        if (payment.recordedBy) {
          cashiers.add(`${payment.recordedBy.firstName} ${payment.recordedBy.lastName}`);
        }
      }
    }

    return {
      from,
      to: rangeEnd,
      period: { startDate, endDate },
      totalSales: round2(totalSales),
      totalQuantity,
      orders: orders.length,
      cashiers: [...cashiers],
      salesByCategory: [...categoryAmount.entries()]
        .map(([category, amount]) => ({
          category,
          amount: round2(amount),
          percent: totalSales > 0 ? round2((amount / totalSales) * 100) : 0,
        }))
        .sort((a, b) => b.amount - a.amount),
      quantitiesByCategory: [...categoryQuantity.entries()]
        .map(([category, quantity]) => ({
          category,
          quantity,
          percent: totalQuantity > 0 ? round2((quantity / totalQuantity) * 100) : 0,
        }))
        .sort((a, b) => b.quantity - a.quantity),
      products: [...products.entries()]
        .map(([name, { quantity, amount }]) => ({ name, quantity, amount: round2(amount) }))
        .sort((a, b) => b.amount - a.amount),
    };
  }
}
