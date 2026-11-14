import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma';
import { OrdersService } from '../orders';
import { WalletService } from '../wallet/wallet.service';
import { CLOSE_METHOD_FOR, FIRST_NAMES, LAST_NAMES, PAYMENT_METHOD_FOR, SENDER_BANKS } from './demo.constants';
import {
  LOW_STOCK_NAMES,
  SUPERMARKET_HELD_MAX_AGE_MIN,
  SUPERMARKET_HELD_TARGET,
  SUPERMARKET_CUSTOMER_RATE,
  SUPERMARKET_ORDER_TYPE,
  SUPERMARKET_ORG_SLUG,
  SUPERMARKET_REGULAR_COUNT,
  SUPERMARKET_RETENTION_DAYS,
} from './supermarket.constants';
import {
  checkoutMinutes,
  supermarketClosingTime,
  supermarketCumulativeShare,
  supermarketDayKey,
  supermarketOpeningTime,
  supermarketOrderCount,
  pickSupermarketPaymentKind,
  planSupermarketBasket,
} from './supermarket-plan';
import { SupermarketSeedService, SupermarketStaff } from './supermarket-seed.service';
import { DayKey, Rng, moniepointReference, pick, randInt, rngFor } from './demo-plan';

function toNumber(val: Prisma.Decimal | number): number {
  return typeof val === 'number' ? val : Number(val);
}

// Upper bound per tick, so a tick after downtime doesn't fire a burst of hundreds of sales.
const MAX_NEW_ORDERS_PER_TICK = 60;
const TICK_WINDOW_MS = 15 * 60_000;
const SHIFT_OPENS_BEFORE_MS = 15 * 60_000;
const SHIFT_CLOSES_AFTER_MS = 10 * 60_000;
const OPENING_FLOAT = 20_000;

/**
 * Keeps the demo supermarket's "today" alive: rings up sales through OrdersService as the day's hourly
 * curve says they should exist, pays each one through closeWithPayment straight away (retail
 * checkout is scan-and-pay, there is no kitchen step), relabels some payments as Moniepoint
 * auto-matches, tops up shelves the way a supplier delivery would, and opens/closes the day's shift.
 *
 * Every sale goes through the same services a real retail org uses, so totals, stock deduction and
 * wallet balances behave exactly as in production. Each tick covers the last 15 minutes, so the
 * sales it creates are backdated to spread across that window instead of all landing at the tick.
 * The shift is closed directly rather than through ShiftsService.close, so no WhatsApp summary goes
 * out every night.
 */
@Injectable()
export class SupermarketLiveService {
  private readonly logger = new Logger(SupermarketLiveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly walletService: WalletService,
    private readonly seedService: SupermarketSeedService,
  ) {}

  /** Only the demo-supermarket slug, and only while it's still flagged as a test account. */
  async isDemoOrg(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { slug: true, isTestAccount: true } });
    return org?.slug === SUPERMARKET_ORG_SLUG && org.isTestAccount;
  }

  async tick(organizationId: string, now = new Date()) {
    if (this.seedService.isPopulating() || !(await this.isDemoOrg(organizationId))) return;
    const staff = await this.seedService.loadStaff(organizationId);
    const key = supermarketDayKey(now);
    const opensAt = supermarketOpeningTime(key);
    const closesAt = supermarketClosingTime(key);

    if (now < opensAt) {
      // Overnight: nothing to sell, but don't leave a stale shift open if the API was down at closing.
      await this.closeOpenShift(organizationId, staff, now);
      await this.expireHeldSales(organizationId, now);
      return;
    }

    if (now.getTime() >= closesAt.getTime() + SHIFT_CLOSES_AFTER_MS) {
      await this.closeOpenShift(organizationId, staff, new Date(closesAt.getTime() + SHIFT_CLOSES_AFTER_MS));
      await this.expireHeldSales(organizationId, now);
      return;
    }

    // Sales this tick are backdated into the stretch since the last sale (at most 15 minutes), so
    // the timeline stays in order even when a tick is triggered by hand between two scheduled ones.
    const lastSale = await this.prisma.order.aggregate({
      where: { organizationId, createdAt: { gte: opensAt } },
      _max: { createdAt: true, closedAt: true },
    });
    const windowStart = new Date(
      Math.min(
        now.getTime(),
        Math.max(
          opensAt.getTime(),
          now.getTime() - TICK_WINDOW_MS,
          lastSale._max.createdAt?.getTime() ?? 0,
          lastSale._max.closedAt?.getTime() ?? 0,
        ),
      ),
    );

    await this.ensureShift(organizationId, staff, key);
    await this.restockShelves(organizationId, staff, windowStart);
    await this.placeSales(organizationId, staff, key, now, windowStart);
    await this.refreshHeldSales(organizationId, staff, key, now);
    await this.occasionalExtras(organizationId, staff, now);
  }

  /** Daily housekeeping: drop data older than the retention window, clear stale review items. */
  async prune(organizationId: string, now = new Date()) {
    if (this.seedService.isPopulating() || !(await this.isDemoOrg(organizationId))) return;
    const cutoff = new Date(now.getTime() - SUPERMARKET_RETENTION_DAYS * 24 * 60 * 60_000);
    const old = { organizationId, createdAt: { lt: cutoff } };
    await this.prisma.walletTransaction.deleteMany({ where: old });
    await this.prisma.moniepointUnreconciledTransfer.deleteMany({ where: old });
    await this.prisma.stockMovement.deleteMany({ where: old });
    await this.prisma.payment.deleteMany({ where: old });
    await this.prisma.order.deleteMany({ where: old });
    await this.prisma.heldSale.deleteMany({ where: { organizationId, createdAt: { lt: cutoff } } });
    await this.prisma.shift.deleteMany({ where: { organizationId, openedAt: { lt: cutoff } } });

    await this.prisma.moniepointUnreconciledTransfer.updateMany({
      where: { organizationId, status: 'PENDING_REVIEW', createdAt: { lt: new Date(now.getTime() - 2 * 24 * 60 * 60_000) } },
      data: { status: 'RESOLVED', resolutionType: 'OTHER', resolvedAt: now, resolutionNotes: 'Refunded to sender' },
    });
  }

  /**
   * Keeps a couple of carts parked at the tills so the Held button always has something in it
   * during a demo. Carts parked longer than SUPERMARKET_HELD_MAX_AGE_MIN are settled — mostly picked
   * up (the customer came back), occasionally discarded — and fresh ones are parked by other lanes.
   */
  private async refreshHeldSales(organizationId: string, staff: SupermarketStaff, key: DayKey, now: Date) {
    const staleBefore = new Date(now.getTime() - SUPERMARKET_HELD_MAX_AGE_MIN * 60_000);
    const stale = await this.prisma.heldSale.findMany({
      where: { organizationId, status: 'HELD', createdAt: { lt: staleBefore } },
      select: { id: true },
    });
    for (const { id } of stale) {
      const pickedUp = rngFor(`supermarket-held-end:${id}`)() < 0.8;
      await this.prisma.heldSale.update({
        where: { id },
        data: pickedUp
          ? { status: 'RECALLED', recalledById: pick(rngFor(`supermarket-held-by:${id}`), staff.cashierIds), settledAt: now }
          : { status: 'DISCARDED', settledAt: now },
      });
    }

    // No point parking a cart in the last half hour — the day is about to be swept.
    if (now.getTime() >= supermarketClosingTime(key).getTime() - 30 * 60_000) return;
    const held = await this.prisma.heldSale.count({ where: { organizationId, status: 'HELD' } });
    if (held >= SUPERMARKET_HELD_TARGET) return;

    const products = await this.prisma.inventoryItem.findMany({
      where: { organizationId, isActive: true, sellPrice: { not: null } },
      select: { id: true, name: true, sellPrice: true },
    });
    const product = new Map(products.map((p) => [p.name, { id: p.id, price: toNumber(p.sellPrice!) }]));

    const stamp = now.toISOString().slice(0, 16);
    for (let i = held; i < SUPERMARKET_HELD_TARGET; i++) {
      const rng = rngFor(`supermarket-held-live:${stamp}:${i}`);
      let lines = planSupermarketBasket(rng);
      for (let attempt = 1; lines.length < 3 && attempt < 6; attempt++) lines = planSupermarketBasket(rng);
      const items = lines.flatMap((line) => {
        const p = product.get(line.name);
        return p ? [{ inventoryItemId: p.id, name: line.name, quantity: line.quantity, unitPrice: p.price }] : [];
      });
      if (items.length === 0) continue;
      await this.prisma.heldSale.create({
        data: {
          organizationId,
          heldById: pick(rng, staff.cashierIds),
          items: items as Prisma.InputJsonValue,
          createdAt: new Date(now.getTime() - randInt(rng, 2, 10) * 60_000),
        },
      });
    }
  }

  /** End of day: whatever is still parked was abandoned, the same way the app's own sweep treats it. */
  private async expireHeldSales(organizationId: string, now: Date) {
    await this.prisma.heldSale.updateMany({
      where: { organizationId, status: 'HELD' },
      data: { status: 'EXPIRED', settledAt: now },
    });
  }

  private async ensureShift(organizationId: string, staff: SupermarketStaff, key: DayKey) {
    const opensAt = new Date(supermarketOpeningTime(key).getTime() - SHIFT_OPENS_BEFORE_MS);
    const open = await this.prisma.shift.findFirst({ where: { organizationId, status: 'OPEN' } });
    if (open && open.openedAt >= opensAt) return;
    if (open) await this.closeOpenShift(organizationId, staff, opensAt);
    await this.prisma.shift.create({
      data: { organizationId, openedById: pick(rngFor(key), staff.cashierIds), openingFloat: OPENING_FLOAT, openedAt: opensAt },
    });
  }

  /** Mirrors ShiftsService.close's breakdown maths, minus the WhatsApp summary. */
  private async closeOpenShift(organizationId: string, staff: SupermarketStaff, closedAt: Date) {
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

  /**
   * A supplier delivery for anything that has run down to its reorder level. The handful of items
   * the demo keeps short on purpose (LOW_STOCK_NAMES) are only topped up once critically low, so
   * the "what do I need to reorder?" view always has something on it.
   */
  private async restockShelves(organizationId: string, staff: SupermarketStaff, at: Date) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, onHandQuantity: true, reorderLevel: true },
    });
    for (const item of items) {
      const onHand = toNumber(item.onHandQuantity);
      const reorder = toNumber(item.reorderLevel);
      const kept = LOW_STOCK_NAMES.has(item.name);
      if (onHand > (kept ? Math.floor(reorder / 3) : reorder)) continue;
      const quantity = kept ? reorder : Math.max(reorder * 4 - onHand, 1);
      try {
        await this.prisma.$transaction([
          this.prisma.inventoryItem.update({ where: { id: item.id }, data: { onHandQuantity: { increment: quantity } } }),
          this.prisma.stockMovement.create({
            data: {
              organizationId,
              inventoryItemId: item.id,
              type: 'RESTOCK',
              quantity,
              onHandBefore: onHand,
              onHandAfter: onHand + quantity,
              notes: 'Supplier delivery',
              createdById: staff.managerId,
              // At the start of the window, so it lands before the sales this tick backdates into it.
              createdAt: at,
            },
          }),
        ]);
      } catch (err) {
        this.logger.warn(`Demo restock of ${item.name} failed: ${err.message}`);
      }
    }
  }

  private async placeSales(organizationId: string, staff: SupermarketStaff, key: DayKey, now: Date, windowStart: Date) {
    const opensAt = supermarketOpeningTime(key);
    const target = Math.round(supermarketOrderCount(key, 0) * supermarketCumulativeShare(key, now));
    const existing = await this.prisma.order.count({ where: { organizationId, createdAt: { gte: opensAt } } });
    const toCreate = Math.min(target - existing, MAX_NEW_ORDERS_PER_TICK);
    if (toCreate <= 0) return;

    const [products, customers] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: { organizationId, isActive: true, sellPrice: { not: null } },
        select: { id: true, name: true, onHandQuantity: true },
      }),
      // Ordered by phone, which the seed assigns in creation order — regulars first.
      this.prisma.customer.findMany({
        where: { organizationId },
        select: { id: true, walletBalance: true, creditLimit: true },
        orderBy: { phone: 'asc' },
      }),
    ]);
    const product = new Map(products.map((p) => [p.name, { id: p.id, onHand: toNumber(p.onHandQuantity) }]));
    const customerById = new Map(customers.map((c) => [c.id, { balance: toNumber(c.walletBalance), limit: toNumber(c.creditLimit) }]));

    // Spread this tick's sales across the window since the last tick, in order, so recent-sales
    // lists and the hourly chart look like a real afternoon rather than a burst every 15 minutes.
    // Rung up early enough that checkout (1–4 minutes) has finished by `now`.
    const windowEnd = Math.max(windowStart.getTime(), now.getTime() - 4 * 60_000);
    const times = Array.from({ length: toCreate }, (_, i) => rngFor(`supermarket-live-time:${key}:${existing + i}`)())
      .map((r) => new Date(windowStart.getTime() + r * (windowEnd - windowStart.getTime())))
      .sort((a, b) => a.getTime() - b.getTime());

    // Paid times strictly increase, so each item's stock movements keep the order they happened in.
    let lastPaidAt = windowStart;
    for (let i = 0; i < toCreate; i++) {
      const rng = rngFor(`supermarket-live:${key}:${existing + i}`);
      const lines = planSupermarketBasket(rng).flatMap((line) => {
        const p = product.get(line.name);
        // Never sell what the shelf doesn't have — the real service would let on-hand go negative.
        if (!p || p.onHand < line.quantity) return [];
        return [{ inventoryItemId: p.id, quantity: line.quantity, name: line.name }];
      });
      if (lines.length === 0) continue;

      const customerId = this.pickCustomerId(rng, customers);
      try {
        const order = await this.ordersService.create(organizationId, pick(rng, staff.cashierIds), {
          source: SUPERMARKET_ORDER_TYPE,
          customerId,
          items: lines.map(({ inventoryItemId, quantity }) => ({ inventoryItemId, quantity })),
          clientRequestId: randomUUID(),
        });
        for (const line of lines) product.get(line.name)!.onHand -= line.quantity;
        const paidAt = new Date(Math.max(lastPaidAt.getTime() + 1000, times[i].getTime() + checkoutMinutes(rng) * 60_000));
        lastPaidAt = paidAt;
        await this.settle(organizationId, staff, order.id, toNumber(order.total), customerId ? customerById.get(customerId) : undefined, rng, paidAt);
        await this.backdate(order.id, times[i], paidAt);
      } catch (err) {
        this.logger.warn(`Demo sale failed: ${err.message}`);
      }
    }
  }

  private pickCustomerId(rng: Rng, customers: { id: string }[]): string | undefined {
    if (customers.length === 0 || rng() > SUPERMARKET_CUSTOMER_RATE) return undefined;
    return rng() < 0.4 ? customers[randInt(rng, 0, Math.min(SUPERMARKET_REGULAR_COUNT, customers.length) - 1)].id : pick(rng, customers).id;
  }

  /** Pays (or, rarely, voids) a sale the moment it's rung up, like the retail checkout does. */
  private async settle(
    organizationId: string,
    staff: SupermarketStaff,
    orderId: string,
    total: number,
    wallet: { balance: number; limit: number } | undefined,
    rng: Rng,
    now: Date,
  ) {
    if (rng() < 0.015) {
      // Voided under the demo admin's own authority — a seeded cashier would need an approver PIN.
      await this.ordersService.cancel(organizationId, orderId, { id: staff.adminId, roles: ['ADMIN'] }, undefined, 'Customer changed their mind');
      return;
    }
    const walletAllowed = !!wallet && wallet.limit > 0 && wallet.balance - total >= -wallet.limit;
    const kind = pickSupermarketPaymentKind(rng, walletAllowed);
    await this.ordersService.closeWithPayment(organizationId, orderId, pick(rng, staff.cashierIds), {
      paymentMethod: CLOSE_METHOD_FOR[kind],
      clientRequestId: randomUUID(),
    });
    if (kind === 'WALLET' && wallet) wallet.balance -= total;
    if (kind === 'AUTO_TRANSFER' || kind === 'AUTO_POS') {
      // What the Moniepoint webhook would have written had it matched the payment itself.
      await this.prisma.payment.updateMany({
        where: { organizationId, orderId },
        data: {
          paymentMethod: PAYMENT_METHOD_FOR[kind],
          isAutoRecorded: true,
          recordedById: null,
          moniepointReference: moniepointReference(rng, kind, now),
        },
      });
    }
  }

  /** Moves everything a sale wrote from "now" to when it was supposedly rung up and paid. */
  private async backdate(orderId: string, createdAt: Date, paidAt: Date) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: { createdAt, ...(order?.status === 'CLOSED_PAID' && { closedAt: paidAt }) },
      }),
      this.prisma.orderItem.updateMany({ where: { orderId }, data: { createdAt } }),
      this.prisma.payment.updateMany({ where: { orderId }, data: { createdAt: paidAt } }),
      this.prisma.stockMovement.updateMany({ where: { orderId }, data: { createdAt: paidAt } }),
      this.prisma.walletTransaction.updateMany({ where: { orderId }, data: { createdAt: paidAt } }),
    ]);
  }

  /** Now and then: a customer on account settles their balance, or a transfer lands that needs matching by hand. */
  private async occasionalExtras(organizationId: string, staff: SupermarketStaff, now: Date) {
    const rng = rngFor(`supermarket-extras:${now.toISOString().slice(0, 16)}`);

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
          amount: randInt(rng, 2, 40) * 250,
          transactionReference: moniepointReference(rng, 'AUTO_TRANSFER', now),
          senderMetadata: {
            customerName: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`.toUpperCase(),
            customerBank: pick(rng, SENDER_BANKS),
            narration: 'Payment for groceries',
          },
          matchReason: 'No matching order',
        },
      });
    }
  }
}
