import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma';
import { OrdersService } from '../orders';
import { WalletService } from '../wallet/wallet.service';
import { CLOSE_METHOD_FOR, DEMO_ORG_SLUG, ORDER_TYPES, PAYMENT_METHOD_FOR, RETENTION_DAYS, SENDER_BANKS, FIRST_NAMES, LAST_NAMES, REGULAR_COUNT } from './demo.constants';
import {
  DayKey,
  Rng,
  businessDayKey,
  cumulativeShare,
  dwellMinutes,
  moniepointReference,
  openingTime,
  pick,
  pickOrderType,
  pickPaymentKind,
  planBasket,
  plannedOrderCount,
  randInt,
  rngFor,
} from './demo-plan';
import { DemoSeedService, DemoStaff } from './demo-seed.service';

function toNumber(val: Prisma.Decimal | number): number {
  return typeof val === 'number' ? val : Number(val);
}

const OPEN_STATUSES: OrderStatus[] = ['OPEN', 'IN_KITCHEN', 'READY'];
// Upper bound per tick, so a tick after downtime doesn't fire a burst of hundreds of orders.
const MAX_NEW_ORDERS_PER_TICK = 60;

/**
 * Keeps the demo org's "today" alive: places orders through OrdersService as the day's hourly
 * curve says they should exist, pays them through closeWithPayment once their dwell time has
 * passed (relabelling some as Moniepoint auto-matches), and opens/closes the day's shift.
 *
 * Every write goes through the same services real restaurants use, so totals, taxes, stock
 * deduction and wallet balances behave exactly as in production. The shift is closed directly
 * rather than through ShiftsService.close, so no WhatsApp summary goes out every night.
 */
@Injectable()
export class DemoLiveService {
  private readonly logger = new Logger(DemoLiveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly walletService: WalletService,
    private readonly seedService: DemoSeedService,
  ) {}

  /** Only the demo-slug org, and only while it's still flagged as a test account. */
  async isDemoOrg(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { slug: true, isTestAccount: true } });
    return org?.slug === DEMO_ORG_SLUG && org.isTestAccount;
  }

  async tick(organizationId: string, now = new Date()) {
    if (this.seedService.isPopulating() || !(await this.isDemoOrg(organizationId))) return;
    const staff = await this.seedService.loadStaff(organizationId);
    const key = businessDayKey(now);

    if (now < openingTime(key)) {
      // Between closing (02:00) and opening (08:00): settle the night and close yesterday's shift.
      await this.closeDueOrders(organizationId, staff, now, true);
      await this.closeOpenShift(organizationId, staff, now);
      return;
    }

    await this.ensureShift(organizationId, staff, key);
    await this.placeOrders(organizationId, staff, key, now);
    await this.closeDueOrders(organizationId, staff, now, false);
    await this.advanceKitchen(organizationId, now);
    await this.occasionalExtras(organizationId, staff, key, now);
  }

  /** Daily housekeeping: drop data older than the retention window, clear stale review items. */
  async prune(organizationId: string, now = new Date()) {
    if (this.seedService.isPopulating() || !(await this.isDemoOrg(organizationId))) return;
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60_000);
    const old = { organizationId, createdAt: { lt: cutoff } };
    await this.prisma.walletTransaction.deleteMany({ where: old });
    await this.prisma.moniepointUnreconciledTransfer.deleteMany({ where: old });
    await this.prisma.stockMovement.deleteMany({ where: old });
    await this.prisma.payment.deleteMany({ where: old });
    await this.prisma.order.deleteMany({ where: old });
    await this.prisma.shift.deleteMany({ where: { organizationId, openedAt: { lt: cutoff } } });

    await this.prisma.moniepointUnreconciledTransfer.updateMany({
      where: { organizationId, status: 'PENDING_REVIEW', createdAt: { lt: new Date(now.getTime() - 2 * 24 * 60 * 60_000) } },
      data: { status: 'RESOLVED', resolutionType: 'OTHER', resolvedAt: now, resolutionNotes: 'Refunded to sender' },
    });
  }

  private async ensureShift(organizationId: string, staff: DemoStaff, key: DayKey) {
    const opensAt = new Date(openingTime(key).getTime() - 15 * 60_000);
    const open = await this.prisma.shift.findFirst({ where: { organizationId, status: 'OPEN' } });
    if (open && open.openedAt >= opensAt) return;
    if (open) await this.closeOpenShift(organizationId, staff, opensAt);
    await this.prisma.shift.create({
      data: { organizationId, openedById: pick(rngFor(key), staff.cashierIds), openingFloat: 50_000, openedAt: opensAt },
    });
  }

  /** Mirrors ShiftsService.close's breakdown maths, minus the WhatsApp summary. */
  private async closeOpenShift(organizationId: string, staff: DemoStaff, closedAt: Date) {
    const shift = await this.prisma.shift.findFirst({ where: { organizationId, status: 'OPEN' } });
    if (!shift) return;
    const grouped = await this.prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: { organizationId, createdAt: { gte: shift.openedAt, lte: closedAt } },
      _sum: { amount: true },
    });
    const cashTaken = toNumber(grouped.find((g) => g.paymentMethod === 'CASH')?._sum.amount ?? 0);
    const expectedCash = toNumber(shift.openingFloat) + cashTaken;
    const rows = grouped.filter((g) => g.paymentMethod !== 'CASH').map((g) => {
      const expectedAmount = toNumber(g._sum.amount ?? 0);
      return { shiftId: shift.id, paymentMethod: g.paymentMethod, expectedAmount, countedAmount: expectedAmount, variance: 0 };
    });
    rows.unshift({ shiftId: shift.id, paymentMethod: 'CASH', expectedAmount: expectedCash, countedAmount: expectedCash, variance: 0 });

    await this.prisma.$transaction([
      this.prisma.shiftPaymentBreakdown.deleteMany({ where: { shiftId: shift.id } }),
      this.prisma.shiftPaymentBreakdown.createMany({ data: rows }),
      this.prisma.shift.update({
        where: { id: shift.id },
        data: { status: 'CLOSED', closedById: staff.cashierIds[0], closedAt, expectedCash, countedCash: expectedCash, variance: 0 },
      }),
    ]);
  }

  private async placeOrders(organizationId: string, staff: DemoStaff, key: DayKey, now: Date) {
    const opensAt = openingTime(key);
    const target = Math.round(plannedOrderCount(key, 0) * cumulativeShare(key, now));
    const existing = await this.prisma.order.count({ where: { organizationId, createdAt: { gte: opensAt } } });
    const toCreate = Math.min(target - existing, MAX_NEW_ORDERS_PER_TICK);
    if (toCreate <= 0) return;

    const [menuItems, tables, customers] = await Promise.all([
      this.prisma.menuItem.findMany({ where: { organizationId }, select: { id: true, name: true } }),
      this.prisma.restaurantTable.findMany({
        where: { organizationId, isActive: true, status: { not: 'OCCUPIED' } },
        select: { id: true, orderType: { select: { name: true } } },
      }),
      this.prisma.customer.findMany({ where: { organizationId }, select: { id: true }, orderBy: { phone: 'asc' } }),
    ]);
    const menuItemId = new Map(menuItems.map((m) => [m.name, m.id]));
    const freeTables = new Map<string, string[]>();
    for (const t of tables) {
      const type = t.orderType?.name ?? 'Dine In';
      freeTables.set(type, [...(freeTables.get(type) ?? []), t.id]);
    }

    for (let i = 0; i < toCreate; i++) {
      const rng = rngFor(`live:${key}:${existing + i}`);
      let source = pickOrderType(rng);
      let tableId: string | undefined;
      if (ORDER_TYPES.find((t) => t.name === source)?.requiresTable) {
        const pool = freeTables.get(source) ?? [];
        if (pool.length === 0) {
          source = 'Takeaway';
        } else {
          tableId = pool.splice(randInt(rng, 0, pool.length - 1), 1)[0];
        }
      }
      const customerId = this.pickCustomerId(rng, customers, source);
      const waiterId = tableId && rng() < 0.7 ? pick(rng, staff.waiterIds) : undefined;
      const items = planBasket(rng, source)
        .filter((line) => menuItemId.has(line.name))
        .map((line) => ({ menuItemId: menuItemId.get(line.name)!, quantity: line.quantity }));

      try {
        await this.ordersService.create(organizationId, pick(rng, staff.cashierIds), {
          source,
          tableId,
          customerId,
          waiterId,
          items,
          clientRequestId: randomUUID(),
        });
      } catch (err) {
        this.logger.warn(`Demo order placement failed: ${err.message}`);
      }
    }
  }

  private pickCustomerId(rng: Rng, customers: { id: string }[], source: string): string | undefined {
    if (customers.length === 0 || rng() > (source === 'Delivery' ? 0.9 : 0.55)) return undefined;
    // Customers are ordered by phone, which the seed assigns in creation order — regulars first.
    return rng() < 0.3 ? customers[randInt(rng, 0, Math.min(REGULAR_COUNT, customers.length) - 1)].id : pick(rng, customers).id;
  }

  private async closeDueOrders(organizationId: string, staff: DemoStaff, now: Date, closeEverything: boolean) {
    const open = await this.prisma.order.findMany({
      where: { organizationId, status: { in: OPEN_STATUSES }, createdAt: { lt: now } },
      select: { id: true, source: true, createdAt: true, total: true, customer: { select: { walletBalance: true, creditLimit: true } } },
    });

    for (const order of open) {
      const rng = rngFor(`close:${order.id}`);
      const dueAt = order.createdAt.getTime() + dwellMinutes(rng, order.source) * 60_000;
      if (!closeEverything && dueAt > now.getTime()) continue;

      try {
        if (rng() < 0.04) {
          // Voided under the demo admin's own authority — a seeded cashier would need an approver PIN.
          await this.ordersService.cancel(
            organizationId,
            order.id,
            { id: staff.adminId, roles: ['ADMIN'] },
            undefined,
            'Customer left before ordering',
          );
          continue;
        }
        const total = toNumber(order.total);
        const customer = order.customer;
        const walletAllowed =
          !!customer && toNumber(customer.creditLimit) > 0 && toNumber(customer.walletBalance) - total >= -toNumber(customer.creditLimit);
        const kind = pickPaymentKind(rng, walletAllowed);
        await this.serveAll(organizationId, order.id);
        await this.ordersService.closeWithPayment(organizationId, order.id, pick(rng, staff.cashierIds), {
          paymentMethod: CLOSE_METHOD_FOR[kind],
          clientRequestId: randomUUID(),
        });
        if (kind === 'AUTO_TRANSFER' || kind === 'AUTO_POS') {
          // What the Moniepoint webhook would have written had it matched the payment itself.
          await this.prisma.payment.updateMany({
            where: { organizationId, orderId: order.id },
            data: {
              paymentMethod: PAYMENT_METHOD_FOR[kind],
              isAutoRecorded: true,
              recordedById: null,
              moniepointReference: moniepointReference(rng, kind, now),
            },
          });
        }
      } catch (err) {
        this.logger.warn(`Demo order ${order.id} close failed: ${err.message}`);
      }
    }
  }

  /**
   * Moves open tickets along the kitchen display, through OrdersService.updateItemStatus so recipe
   * stock is deducted on SERVED exactly as a real kitchen would trigger it.
   */
  private async advanceKitchen(organizationId: string, now: Date) {
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
    const open = await this.prisma.order.findMany({
      where: { organizationId, status: { in: OPEN_STATUSES }, createdAt: { lt: minutesAgo(5) } },
      select: { id: true, createdAt: true, items: { select: { id: true, status: true } } },
    });
    for (const order of open) {
      const cooked = order.createdAt < minutesAgo(25);
      for (const item of order.items) {
        const next = item.status === 'PENDING' ? 'ON_IT' : item.status === 'ON_IT' && cooked ? 'SERVED' : undefined;
        if (next) await this.setItemStatus(organizationId, order.id, item.id, next);
      }
    }
    await this.prisma.restaurantTable.updateMany({
      where: { organizationId, status: 'NEEDS_CLEANING', updatedAt: { lt: minutesAgo(10) } },
      data: { status: 'AVAILABLE' },
    });
  }

  /** Serves whatever is still on the kitchen display before the bill is settled. */
  private async serveAll(organizationId: string, orderId: string) {
    const items = await this.prisma.orderItem.findMany({ where: { orderId, status: { not: 'SERVED' } }, select: { id: true } });
    for (const item of items) await this.setItemStatus(organizationId, orderId, item.id, 'SERVED');
  }

  private async setItemStatus(organizationId: string, orderId: string, itemId: string, status: 'ON_IT' | 'SERVED') {
    try {
      await this.ordersService.updateItemStatus(organizationId, orderId, itemId, { status });
    } catch (err) {
      this.logger.warn(`Demo item ${itemId} → ${status} failed: ${err.message}`);
    }
  }

  /** Now and then: a regular settles their tab, or a transfer lands that needs matching by hand. */
  private async occasionalExtras(organizationId: string, staff: DemoStaff, key: DayKey, now: Date) {
    const rng = rngFor(`extras:${now.toISOString().slice(0, 16)}`);

    if (rng() < 0.08) {
      const debtor = await this.prisma.customer.findFirst({
        where: { organizationId, walletBalance: { lt: 0 } },
        orderBy: { walletBalance: 'asc' },
      });
      if (debtor) {
        await this.walletService.topUp(organizationId, debtor.id, pick(rng, staff.cashierIds), {
          amount: Math.ceil(-toNumber(debtor.walletBalance) / 5000) * 5000,
          paymentMethod: 'BANK_TRANSFER',
          clientRequestId: randomUUID(),
        });
      }
    }

    const pending = await this.prisma.moniepointUnreconciledTransfer.count({ where: { organizationId, status: 'PENDING_REVIEW' } });
    if (pending < 3 && rng() < 0.04) {
      await this.prisma.moniepointUnreconciledTransfer.create({
        data: {
          organizationId,
          source: rng() < 0.8 ? 'TRANSFER' : 'CARD',
          amount: randInt(rng, 6, 90) * 250,
          transactionReference: moniepointReference(rng, 'AUTO_TRANSFER', now),
          senderMetadata: {
            customerName: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`.toUpperCase(),
            customerBank: pick(rng, SENDER_BANKS),
            narration: 'Payment for food',
          },
          matchReason: 'No matching order',
        },
      });
    }
  }
}
