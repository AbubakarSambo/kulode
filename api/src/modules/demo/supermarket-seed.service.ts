import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma';
import { FIRST_NAMES, LAST_NAMES, PAYMENT_METHOD_FOR, PAYMENT_TYPES, SENDER_BANKS } from './demo.constants';
import {
  SPOILAGE_WRITE_OFFS,
  SUPERMARKET_ADMIN_EMAIL,
  SUPERMARKET_CUSTOMER_COUNT,
  SUPERMARKET_CUSTOMER_RATE,
  SUPERMARKET_EXTRA_WALLET_CUSTOMERS,
  SUPERMARKET_HELD_TARGET,
  SUPERMARKET_HISTORY_DAYS,
  SUPERMARKET_ORDER_TYPE,
  SUPERMARKET_ORG_NAME,
  SUPERMARKET_ORG_SETTINGS,
  SUPERMARKET_ORG_SLUG,
  SUPERMARKET_PRICE_CHANGE,
  SUPERMARKET_REGULAR_COUNT,
  SUPERMARKET_SHIFT_END_TIME,
  SUPERMARKET_SHIFT_START_TIME,
  SUPERMARKET_STAFF,
  SUPERMARKET_STAFF_EMAIL_DOMAIN,
  SUPERMARKET_STOCK_WINDOW_DAYS,
  LOW_STOCK_NAMES,
  PRODUCTS,
} from './supermarket.constants';
import {
  PlannedStockMovement,
  StockSale,
  checkoutMinutes,
  supermarketClosingTime,
  supermarketDayKey,
  supermarketOpeningTime,
  supermarketOrderCount,
  supermarketSaleTime,
  pickSupermarketPaymentKind,
  planSupermarketBasket,
  planStockMovements,
  supermarketVat,
} from './supermarket-plan';
import { DayKey, addDays, createRng, lagosDate, moniepointReference, pick, randInt, rngFor } from './demo-plan';

const CHUNK = 2000;
const SHIFT_OPENS_BEFORE_MIN = 15;
const SHIFT_CLOSES_AFTER_MIN = 10;

export interface SupermarketStaff {
  adminId: string;
  managerId: string;
  cashierIds: string[];
}

interface DemoCustomer {
  id: string;
  name: string;
  creditLimit: number;
  balance: number;
}

/**
 * Creates (or wipes and rebuilds) the "Baobab Fresh Supermarket Gwarinpa" sales-demo organization —
 * a multi-lane RETAIL-mode POS org selling a barcoded grocery catalogue, with VAT on — with
 * SUPERMARKET_HISTORY_DAYS of sales written in bulk with backdated timestamps. Today's activity after
 * the reset is driven by SupermarketLiveService through the real order services.
 *
 * Mirrors PharmacySeedService / DemoSeedService and carries the same safety rails: it only ever
 * touches the org with slug SUPERMARKET_ORG_SLUG and refuses to run if that org isn't flagged
 * isTestAccount, since a reset deletes all of the org's POS data.
 */
@Injectable()
export class SupermarketSeedService {
  private readonly logger = new Logger(SupermarketSeedService.name);
  private populating = false;

  constructor(private readonly prisma: PrismaService) {}

  isPopulating() {
    return this.populating;
  }

  async findDemoOrg() {
    return this.prisma.organization.findUnique({ where: { slug: SUPERMARKET_ORG_SLUG } });
  }

  /**
   * Resets the demo supermarket. Creates the org and its logins synchronously (returning the admin
   * password only when the admin login is first created), then rebuilds the data in the
   * background — a full rebuild writes ~10k sales and can outlast an HTTP request.
   */
  async reset(now = new Date()) {
    if (this.populating) throw new BadRequestException('A supermarket demo reset is already running');

    const existing = await this.findDemoOrg();
    if (existing && !existing.isTestAccount) {
      throw new BadRequestException(`Organization ${existing.id} has the demo slug but is not a test account — refusing to reset it`);
    }
    const org = existing ?? (await this.createOrg());
    const { staff, adminPassword } = await this.ensureStaff(org.id);

    this.populating = true;
    void this.populate(org.id, staff, now)
      .then(() => this.logger.log(`Demo supermarket ${org.id} rebuilt`))
      .catch((err) => this.logger.error(`Demo supermarket ${org.id} rebuild failed: ${err.message}`, err.stack))
      .finally(() => (this.populating = false));

    return {
      organizationId: org.id,
      adminEmail: SUPERMARKET_ADMIN_EMAIL,
      adminPassword,
      status: 'Rebuilding demo data in the background — usually done within a few minutes.',
    };
  }

  async loadStaff(organizationId: string): Promise<SupermarketStaff> {
    const users = await this.prisma.user.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, email: true, roles: true },
    });
    const admin = users.find((u) => u.email === SUPERMARKET_ADMIN_EMAIL);
    if (!admin) throw new BadRequestException('Demo supermarket admin login is missing — run a supermarket demo reset');
    return {
      adminId: admin.id,
      managerId: users.find((u) => u.roles.includes('MANAGER'))?.id ?? admin.id,
      cashierIds: users.filter((u) => u.roles.includes('CASHIER')).map((u) => u.id),
    };
  }

  private async createOrg() {
    return this.prisma.organization.create({
      data: {
        name: SUPERMARKET_ORG_NAME,
        slug: SUPERMARKET_ORG_SLUG,
        email: SUPERMARKET_ADMIN_EMAIL,
        address: 'Plot 14, 1st Avenue, Gwarinpa, Abuja',
        businessType: 'Supermarket',
        enabledModules: 'POS',
        posMode: 'RETAIL',
        shiftStartTime: SUPERMARKET_SHIFT_START_TIME,
        shiftEndTime: SUPERMARKET_SHIFT_END_TIME,
        ...SUPERMARKET_ORG_SETTINGS,
        planTier: 'BUSINESS',
        subscriptionStatus: 'ACTIVE',
        isGrandfathered: true,
        isTestAccount: true,
        onboardingDismissedAt: new Date(),
      },
    });
  }

  private async ensureStaff(organizationId: string): Promise<{ staff: SupermarketStaff; adminPassword: string | null }> {
    let adminPassword: string | null = null;
    const admin = await this.prisma.user.findUnique({ where: { email: SUPERMARKET_ADMIN_EMAIL } });
    if (admin && admin.organizationId !== organizationId) {
      throw new BadRequestException(`${SUPERMARKET_ADMIN_EMAIL} already belongs to another organization`);
    }
    if (!admin) {
      adminPassword = randomBytes(9).toString('base64url');
      await this.prisma.user.create({
        data: {
          organizationId,
          email: SUPERMARKET_ADMIN_EMAIL,
          passwordHash: await bcrypt.hash(adminPassword, 12),
          firstName: 'Baobab',
          lastName: 'Demo',
          roles: ['SUPER_ADMIN'],
          isEmailVerified: true,
        },
      });
    }

    for (const member of SUPERMARKET_STAFF) {
      const email = `${member.firstName}.${member.lastName}@${SUPERMARKET_STAFF_EMAIL_DOMAIN}`.toLowerCase();
      const existing = await this.prisma.user.findUnique({ where: { email }, select: { organizationId: true } });
      if (existing && existing.organizationId !== organizationId) {
        throw new BadRequestException(`${email} already belongs to another organization`);
      }
      if (existing) continue;
      await this.prisma.user.create({
        data: {
          organizationId,
          email,
          firstName: member.firstName,
          lastName: member.lastName,
          roles: member.roles,
          isEmailVerified: true,
          hasPlaceholderEmail: true,
        },
      });
    }

    return { staff: await this.loadStaff(organizationId), adminPassword };
  }

  /** Deletes all of the org's POS data, children before parents. Keeps the org and its logins. */
  private async wipe(organizationId: string) {
    const where = { organizationId };
    await this.prisma.walletTransaction.deleteMany({ where });
    await this.prisma.moniepointUnreconciledTransfer.deleteMany({ where });
    await this.prisma.stockMovement.deleteMany({ where });
    await this.prisma.payment.deleteMany({ where });
    await this.prisma.whatsappMessage.deleteMany({ where });
    await this.prisma.sheetSyncQueueEntry.deleteMany({ where });
    await this.prisma.order.deleteMany({ where });
    await this.prisma.shift.deleteMany({ where });
    await this.prisma.customer.deleteMany({ where });
    // Loyalty set-up made in the demo (customers' rewards, messages and ledger went with the customers
    // above): the reward rules, member discounts and daily coverage figures, and the on/off switch —
    // so a loyalty demo can be re-recorded from a clean start (same as the restaurant demo's reset).
    await this.prisma.loyaltyRewardRule.deleteMany({ where });
    await this.prisma.memberDiscount.deleteMany({ where });
    await this.prisma.coverageSnapshot.deleteMany({ where });
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { loyaltyEnabled: false, loyaltyStartAt: null, loyaltyExpiryDays: 90 },
    });
    // Carts parked at the tills (they reference users, not the data above).
    await this.prisma.heldSale.deleteMany({ where });
    await this.prisma.inventoryItem.deleteMany({ where });
    await this.prisma.orderType.deleteMany({ where });
    await this.prisma.paymentType.deleteMany({ where });
  }

  private async populate(organizationId: string, staff: SupermarketStaff, now: Date) {
    await this.wipe(organizationId);
    const itemId = await this.createReferenceData(organizationId);
    const customers = await this.createCustomers(organizationId);
    await this.createHistory(organizationId, staff, itemId, customers, now);
    await this.seedHeldSales(organizationId, staff, itemId, now);
  }

  /** Order/payment types and the barcoded catalogue. Returns product name → InventoryItem id. */
  private async createReferenceData(organizationId: string) {
    await this.prisma.orderType.create({
      data: { organizationId, name: SUPERMARKET_ORDER_TYPE, requiresTable: false, sortOrder: 0 },
    });
    await this.prisma.paymentType.createMany({
      data: PAYMENT_TYPES.map((name, i) => ({ organizationId, name, sortOrder: i })),
    });

    const itemId = new Map<string, string>();
    await this.prisma.inventoryItem.createMany({
      data: PRODUCTS.map((p) => {
        const id = randomUUID();
        itemId.set(p.name, id);
        return {
          id,
          organizationId,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          department: p.department,
          vatCategory: p.vatCategory,
          sellPrice: p.price,
          unitPrice: p.cost,
          unitOfMeasure: 'UNIT' as const,
          onHandQuantity: p.onHand,
          reorderLevel: p.reorderLevel,
        };
      }),
    });
    return itemId;
  }

  private async createCustomers(organizationId: string): Promise<DemoCustomer[]> {
    const rng = createRng(20261114);
    const combos = FIRST_NAMES.flatMap((first) => LAST_NAMES.map((last) => `${first} ${last}`));
    for (let i = combos.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [combos[i], combos[j]] = [combos[j], combos[i]];
    }
    const customers: DemoCustomer[] = combos.slice(0, SUPERMARKET_CUSTOMER_COUNT).map((name, i) => ({
      id: randomUUID(),
      name,
      creditLimit: i < SUPERMARKET_REGULAR_COUNT + SUPERMARKET_EXTRA_WALLET_CUSTOMERS ? randInt(rng, 1, 6) * 25_000 : 0,
      balance: 0,
    }));
    await this.prisma.customer.createMany({
      data: customers.map((c, i) => ({
        id: c.id,
        organizationId,
        name: c.name,
        // Fictional numbers in a range not used for real Nigerian mobile lines.
        phone: `+23480010${String(10000 + i)}`,
        creditLimit: c.creditLimit,
      })),
    });
    return customers;
  }

  private async createHistory(
    organizationId: string,
    staff: SupermarketStaff,
    itemId: Map<string, string>,
    customers: DemoCustomer[],
    now: Date,
  ) {
    const todayKey = supermarketDayKey(now);
    const priceChangeAt = supermarketOpeningTime(addDays(todayKey, -SUPERMARKET_PRICE_CHANGE.daysAgo));
    const walletCustomers = customers.filter((c) => c.creditLimit > 0);

    const orders: Prisma.OrderCreateManyInput[] = [];
    const items: Prisma.OrderItemCreateManyInput[] = [];
    const payments: Prisma.PaymentCreateManyInput[] = [];
    const walletTx: Prisma.WalletTransactionCreateManyInput[] = [];
    const shifts: Prisma.ShiftCreateManyInput[] = [];
    const breakdowns: Prisma.ShiftPaymentBreakdownCreateManyInput[] = [];
    const transfers: Prisma.MoniepointUnreconciledTransferCreateManyInput[] = [];
    const sales: StockSale[] = [];

    const moveWallet = (customer: DemoCustomer, delta: number, at: Date, extra: Partial<Prisma.WalletTransactionCreateManyInput>) => {
      const balanceBefore = customer.balance;
      customer.balance = Math.round((customer.balance + delta) * 100) / 100;
      walletTx.push({
        organizationId,
        customerId: customer.id,
        amount: delta,
        balanceBefore,
        balanceAfter: customer.balance,
        createdById: pick(createRng(at.getTime()), staff.cashierIds),
        createdAt: at,
        type: 'TOPUP',
        ...extra,
      });
    };

    for (let daysAgo = SUPERMARKET_HISTORY_DAYS; daysAgo >= 0; daysAgo--) {
      const key: DayKey = addDays(todayKey, -daysAgo);
      const rng = rngFor(`supermarket-day:${key}`);
      const dayPayments: { method: string; amount: number }[] = [];
      const manualTransferOrders: { id: string; total: number; closedAt: Date }[] = [];

      // Wallet top-ups: customers on account settle up every so often; a few prepay.
      for (const customer of walletCustomers) {
        const at = supermarketSaleTime(rng, key);
        if (at > now) continue;
        if (customer.balance < -0.5 * customer.creditLimit && rng() < 0.4) {
          moveWallet(customer, Math.ceil(-customer.balance / 5000) * 5000, at, { notes: 'Top-up via Bank Transfer' });
        } else if (customer.balance >= 0 && customer.balance < 25_000 && rng() < 0.03) {
          moveWallet(customer, randInt(rng, 2, 6) * 10_000, at, { notes: 'Top-up via Card' });
        }
      }

      const count = supermarketOrderCount(key, daysAgo);
      const planned = Array.from({ length: count }, () => supermarketSaleTime(rng, key)).sort((a, b) => a.getTime() - b.getTime());

      for (const createdAt of planned) {
        if (createdAt > now) break;
        const orderRng = createRng(Math.floor(rng() * 2 ** 32));
        const id = randomUUID();
        const closedAt = new Date(Math.min(createdAt.getTime() + checkoutMinutes(orderRng) * 60_000, now.getTime()));

        const customer = this.pickCustomer(orderRng, customers);
        const lines = planSupermarketBasket(orderRng).map((line) => ({
          ...line,
          price: line.name === SUPERMARKET_PRICE_CHANGE.itemName && createdAt < priceChangeAt ? SUPERMARKET_PRICE_CHANGE.oldPrice : line.price,
        }));
        const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
        const vat = supermarketVat(subtotal);
        const total = subtotal + vat;
        const cancelled = orderRng() < 0.015;

        for (const line of lines) {
          items.push({
            orderId: id,
            inventoryItemId: itemId.get(line.name),
            itemName: line.name,
            quantity: line.quantity,
            unitPrice: line.price,
            amount: line.price * line.quantity,
            createdAt,
          });
          if (!cancelled) sales.push({ itemId: itemId.get(line.name)!, at: closedAt, quantity: line.quantity, orderId: id });
        }

        let amountPaid = 0;
        if (!cancelled) {
          const walletAllowed = !!customer && customer.creditLimit > 0 && customer.balance - total >= -customer.creditLimit;
          const kind = pickSupermarketPaymentKind(orderRng, walletAllowed);
          const paymentId = randomUUID();
          const isAuto = kind === 'AUTO_TRANSFER' || kind === 'AUTO_POS';
          // Some auto-matched transfers land a few kobo short and are written off, like real ones.
          const shortfall = isAuto && orderRng() < 0.15 ? 0.5 : 0;
          const amount = Math.round((total - shortfall) * 100) / 100;
          payments.push({
            id: paymentId,
            organizationId,
            orderId: id,
            recordedById: isAuto ? undefined : pick(orderRng, staff.cashierIds),
            amount,
            paymentMethod: PAYMENT_METHOD_FOR[kind],
            paymentDate: lagosDate(closedAt),
            isAutoRecorded: isAuto,
            moniepointReference: isAuto ? moniepointReference(orderRng, kind as 'AUTO_TRANSFER' | 'AUTO_POS', closedAt) : undefined,
            notes: shortfall ? `Received ₦${amount} — ₦${shortfall} shortfall written off (within tolerance)` : undefined,
            createdAt: closedAt,
          });
          dayPayments.push({ method: PAYMENT_METHOD_FOR[kind], amount });
          if (kind === 'WALLET' && customer) {
            moveWallet(customer, -total, closedAt, { type: 'ORDER_DEBIT', orderId: id, paymentId });
          }
          if (kind === 'MANUAL_TRANSFER') manualTransferOrders.push({ id, total, closedAt });
          amountPaid = total;
        }

        orders.push({
          id,
          organizationId,
          customerId: customer?.id,
          createdById: pick(orderRng, staff.cashierIds),
          source: SUPERMARKET_ORDER_TYPE,
          status: cancelled ? 'CANCELLED' : 'CLOSED_PAID',
          subtotal,
          taxAmount: vat,
          total,
          amountPaid,
          vatApplied: vat > 0,
          entertainmentTaxApplied: false,
          serviceChargeApplied: false,
          vatAmount: vat,
          entertainmentTaxAmount: 0,
          serviceChargeAmount: 0,
          closedAt: cancelled ? undefined : closedAt,
          createdAt,
        });
      }

      transfers.push(...this.planTransfers(rng, organizationId, staff, manualTransferOrders, key, now, daysAgo));

      const closesAt = new Date(supermarketClosingTime(key).getTime() + SHIFT_CLOSES_AFTER_MIN * 60_000);
      if (now >= closesAt) {
        shifts.push(this.planShift(rng, organizationId, staff, key, dayPayments, breakdowns));
      } else if (daysAgo === 0 && now >= new Date(supermarketOpeningTime(key).getTime() - SHIFT_OPENS_BEFORE_MIN * 60_000)) {
        // Today's shift is still running; SupermarketLiveService closes it after hours.
        shifts.push({
          id: randomUUID(),
          organizationId,
          openedById: staff.cashierIds[0],
          openingFloat: 20_000,
          openedAt: new Date(supermarketOpeningTime(key).getTime() - SHIFT_OPENS_BEFORE_MIN * 60_000),
        });
      }
    }

    await this.insertInChunks((data) => this.prisma.order.createMany({ data }), orders);
    await this.insertInChunks((data) => this.prisma.orderItem.createMany({ data }), items);
    await this.insertInChunks((data) => this.prisma.payment.createMany({ data }), payments);
    await this.insertInChunks((data) => this.prisma.walletTransaction.createMany({ data }), walletTx);
    await this.insertInChunks((data) => this.prisma.shift.createMany({ data }), shifts);
    await this.insertInChunks((data) => this.prisma.shiftPaymentBreakdown.createMany({ data }), breakdowns);
    await this.insertInChunks((data) => this.prisma.moniepointUnreconciledTransfer.createMany({ data }), transfers);

    const movements = this.planMovements(itemId, sales, now);
    await this.insertInChunks(
      (data) => this.prisma.stockMovement.createMany({ data }),
      movements.map<Prisma.StockMovementCreateManyInput>((m) => ({
        organizationId,
        inventoryItemId: m.itemId,
        orderId: m.orderId,
        type: m.type,
        quantity: m.quantity,
        onHandBefore: m.onHandBefore,
        onHandAfter: m.onHandAfter,
        notes: m.notes,
        createdById: m.type === 'ORDER_DEDUCTED' ? undefined : staff.managerId,
        createdAt: m.at,
      })),
    );

    for (const customer of walletCustomers.filter((c) => c.balance !== 0)) {
      await this.prisma.customer.update({ where: { id: customer.id }, data: { walletBalance: customer.balance } });
    }
    this.logger.log(
      `Demo supermarket history: ${orders.length} sales, ${payments.length} payments, ${walletTx.length} wallet movements, ${movements.length} stock movements`,
    );
  }

  /**
   * A couple of carts parked at the tills — a customer gone to fetch something — so the Held button
   * has something in it when a prospect opens checkout. Only while the shop is open (an overnight
   * "held cart" would be odd); SupermarketLiveService keeps them fresh from then on.
   */
  private async seedHeldSales(organizationId: string, staff: SupermarketStaff, itemId: Map<string, string>, now: Date) {
    const key = supermarketDayKey(now);
    if (now < supermarketOpeningTime(key) || now >= supermarketClosingTime(key)) return;

    const minutesAgo = [6, 17, 31];
    const rows: Prisma.HeldSaleCreateManyInput[] = [];
    for (let i = 0; i < SUPERMARKET_HELD_TARGET; i++) {
      // A parked cart is a real shop, not a single packet of gum: keep drawing until it has a few lines.
      let lines = planSupermarketBasket(rngFor(`supermarket-held:${key}:${i}:0`));
      for (let attempt = 1; lines.length < 3 && attempt < 6; attempt++) {
        lines = planSupermarketBasket(rngFor(`supermarket-held:${key}:${i}:${attempt}`));
      }
      rows.push({
        organizationId,
        heldById: staff.cashierIds[i % staff.cashierIds.length],
        items: lines.map((l) => ({
          inventoryItemId: itemId.get(l.name)!,
          name: l.name,
          quantity: l.quantity,
          unitPrice: l.price,
        })) as Prisma.InputJsonValue,
        createdAt: new Date(now.getTime() - minutesAgo[i] * 60_000),
      });
    }
    await this.prisma.heldSale.createMany({ data: rows });
  }

  private planMovements(itemId: Map<string, string>, sales: StockSale[], now: Date): PlannedStockMovement[] {
    const todayKey = supermarketDayKey(now);
    return planStockMovements(
      PRODUCTS.map((p) => ({ id: itemId.get(p.name)!, name: p.name, finalOnHand: p.onHand, lowStock: LOW_STOCK_NAMES.has(p.name) })),
      sales,
      SPOILAGE_WRITE_OFFS.filter(([, , daysAgo]) => daysAgo <= SUPERMARKET_STOCK_WINDOW_DAYS).map(([name, quantity, daysAgo]) => ({
        itemId: itemId.get(name)!,
        quantity,
        at: new Date(supermarketOpeningTime(addDays(todayKey, -daysAgo)).getTime() + 9 * 60 * 60_000),
        notes: 'Spoiled or expired stock written off',
      })),
      now,
      SUPERMARKET_STOCK_WINDOW_DAYS,
    );
  }

  /** Most walk-ins are anonymous; some attach a repeat customer, regulars far more often. */
  private pickCustomer(rng: () => number, customers: DemoCustomer[]): DemoCustomer | undefined {
    if (rng() > SUPERMARKET_CUSTOMER_RATE) return undefined;
    return rng() < 0.4 ? customers[randInt(rng, 0, SUPERMARKET_REGULAR_COUNT - 1)] : pick(rng, customers);
  }

  private planShift(
    rng: () => number,
    organizationId: string,
    staff: SupermarketStaff,
    key: DayKey,
    dayPayments: { method: string; amount: number }[],
    breakdowns: Prisma.ShiftPaymentBreakdownCreateManyInput[],
  ): Prisma.ShiftCreateManyInput {
    const id = randomUUID();
    const openingFloat = 20_000;
    const totals = new Map<string, number>([['CASH', 0]]);
    for (const p of dayPayments) totals.set(p.method, (totals.get(p.method) ?? 0) + p.amount);

    const expectedCash = openingFloat + (totals.get('CASH') ?? 0);
    // Most nights the till balances; some nights it's a little short.
    const cashVariance = rng() < 0.25 ? -randInt(rng, 1, 5) * 200 : 0;
    for (const [paymentMethod, amount] of totals) {
      const isCash = paymentMethod === 'CASH';
      const expectedAmount = isCash ? expectedCash : Math.round(amount * 100) / 100;
      const variance = isCash ? cashVariance : 0;
      breakdowns.push({ shiftId: id, paymentMethod, expectedAmount, countedAmount: expectedAmount + variance, variance });
    }
    const cashierId = pick(rng, staff.cashierIds);
    return {
      id,
      organizationId,
      openedById: cashierId,
      closedById: cashierId,
      status: 'CLOSED',
      openingFloat,
      expectedCash,
      countedCash: expectedCash + cashVariance,
      variance: cashVariance,
      openedAt: new Date(supermarketOpeningTime(key).getTime() - SHIFT_OPENS_BEFORE_MIN * 60_000),
      closedAt: new Date(supermarketClosingTime(key).getTime() + SHIFT_CLOSES_AFTER_MIN * 60_000),
    };
  }

  /**
   * Moniepoint transfers the webhook couldn't match: most history ones were later assigned to the
   * sale a cashier had paid by hand; the last couple of days leave a few in the review queue.
   */
  private planTransfers(
    rng: () => number,
    organizationId: string,
    staff: SupermarketStaff,
    manualTransferOrders: { id: string; total: number; closedAt: Date }[],
    key: DayKey,
    now: Date,
    daysAgo: number,
  ): Prisma.MoniepointUnreconciledTransferCreateManyInput[] {
    const rows: Prisma.MoniepointUnreconciledTransferCreateManyInput[] = [];
    const sender = () => ({
      customerName: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`.toUpperCase(),
      customerBank: pick(rng, SENDER_BANKS),
      narration: 'Payment for groceries',
    });

    if (manualTransferOrders.length && rng() < 0.8) {
      const order = pick(rng, manualTransferOrders);
      rows.push({
        organizationId,
        source: 'TRANSFER',
        amount: order.total,
        transactionReference: moniepointReference(rng, 'AUTO_TRANSFER', order.closedAt),
        senderMetadata: sender(),
        status: 'RESOLVED',
        matchReason: 'Ambiguous — multiple matching orders',
        resolutionType: 'ORDER',
        resolvedOrderId: order.id,
        resolvedById: pick(rng, staff.cashierIds),
        resolvedAt: new Date(order.closedAt.getTime() + 4 * 60_000),
        createdAt: new Date(order.closedAt.getTime() - 60_000),
      });
    }

    if (daysAgo <= 1) {
      for (let i = 0; i < (daysAgo === 0 ? 1 : 2); i++) {
        const createdAt = supermarketSaleTime(rng, key);
        if (createdAt > now) continue;
        rows.push({
          organizationId,
          source: rng() < 0.8 ? 'TRANSFER' : 'CARD',
          amount: randInt(rng, 2, 40) * 250,
          transactionReference: moniepointReference(rng, 'AUTO_TRANSFER', createdAt),
          senderMetadata: sender(),
          matchReason: 'No matching order',
          createdAt,
        });
      }
    }
    return rows;
  }

  private async insertInChunks<T>(insert: (rows: T[]) => Promise<unknown>, rows: T[]) {
    for (let i = 0; i < rows.length; i += CHUNK) {
      await insert(rows.slice(i, i + CHUNK));
    }
  }
}
