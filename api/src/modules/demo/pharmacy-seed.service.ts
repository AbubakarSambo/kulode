import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma';
import { FIRST_NAMES, LAST_NAMES, PAYMENT_METHOD_FOR, PAYMENT_TYPES, SENDER_BANKS } from './demo.constants';
import {
  EXPIRY_WRITE_OFFS,
  PHARMACY_ADMIN_EMAIL,
  PHARMACY_CUSTOMER_COUNT,
  PHARMACY_CUSTOMER_RATE,
  PHARMACY_EXTRA_WALLET_CUSTOMERS,
  PHARMACY_HISTORY_DAYS,
  PHARMACY_ORDER_TYPE,
  PHARMACY_ORG_NAME,
  PHARMACY_ORG_SETTINGS,
  PHARMACY_ORG_SLUG,
  PHARMACY_PRICE_CHANGE,
  PHARMACY_REGULAR_COUNT,
  PHARMACY_SHIFT_END_TIME,
  PHARMACY_SHIFT_START_TIME,
  PHARMACY_STAFF,
  PHARMACY_STAFF_EMAIL_DOMAIN,
  PHARMACY_STOCK_WINDOW_DAYS,
  LOW_STOCK_NAMES,
  PRODUCTS,
} from './pharmacy.constants';
import {
  PlannedStockMovement,
  StockSale,
  checkoutMinutes,
  pharmacyClosingTime,
  pharmacyDayKey,
  pharmacyOpeningTime,
  pharmacyOrderCount,
  pharmacySaleTime,
  pickPharmacyPaymentKind,
  planPharmacyBasket,
  planStockMovements,
} from './pharmacy-plan';
import { DayKey, addDays, createRng, lagosDate, moniepointReference, pick, randInt, rngFor } from './demo-plan';

const CHUNK = 2000;
const SHIFT_OPENS_BEFORE_MIN = 15;
const SHIFT_CLOSES_AFTER_MIN = 10;

export interface PharmacyStaff {
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
 * Creates (or wipes and rebuilds) the "Meridian Pharmacy Wuse II" sales-demo organization — a
 * RETAIL-mode POS org selling a barcoded drug and consumer-health catalogue — with
 * PHARMACY_HISTORY_DAYS of sales written in bulk with backdated timestamps. Today's activity after
 * the reset is driven by PharmacyLiveService through the real order services.
 *
 * Mirrors DemoSeedService (the restaurant demo) and carries the same safety rails: it only ever
 * touches the org with slug PHARMACY_ORG_SLUG and refuses to run if that org isn't flagged
 * isTestAccount, since a reset deletes all of the org's POS data.
 */
@Injectable()
export class PharmacySeedService {
  private readonly logger = new Logger(PharmacySeedService.name);
  private populating = false;

  constructor(private readonly prisma: PrismaService) {}

  isPopulating() {
    return this.populating;
  }

  async findDemoOrg() {
    return this.prisma.organization.findUnique({ where: { slug: PHARMACY_ORG_SLUG } });
  }

  /**
   * Resets the demo pharmacy. Creates the org and its logins synchronously (returning the admin
   * password only when the admin login is first created), then rebuilds the data in the
   * background — a full rebuild writes ~10k sales and can outlast an HTTP request.
   */
  async reset(now = new Date()) {
    if (this.populating) throw new BadRequestException('A pharmacy demo reset is already running');

    const existing = await this.findDemoOrg();
    if (existing && !existing.isTestAccount) {
      throw new BadRequestException(`Organization ${existing.id} has the demo slug but is not a test account — refusing to reset it`);
    }
    const org = existing ?? (await this.createOrg());
    const { staff, adminPassword } = await this.ensureStaff(org.id);

    this.populating = true;
    void this.populate(org.id, staff, now)
      .then(() => this.logger.log(`Demo pharmacy ${org.id} rebuilt`))
      .catch((err) => this.logger.error(`Demo pharmacy ${org.id} rebuild failed: ${err.message}`, err.stack))
      .finally(() => (this.populating = false));

    return {
      organizationId: org.id,
      adminEmail: PHARMACY_ADMIN_EMAIL,
      adminPassword,
      status: 'Rebuilding demo data in the background — usually done within a few minutes.',
    };
  }

  async loadStaff(organizationId: string): Promise<PharmacyStaff> {
    const users = await this.prisma.user.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, email: true, roles: true },
    });
    const admin = users.find((u) => u.email === PHARMACY_ADMIN_EMAIL);
    if (!admin) throw new BadRequestException('Demo pharmacy admin login is missing — run a pharmacy demo reset');
    return {
      adminId: admin.id,
      managerId: users.find((u) => u.roles.includes('MANAGER'))?.id ?? admin.id,
      cashierIds: users.filter((u) => u.roles.includes('CASHIER')).map((u) => u.id),
    };
  }

  private async createOrg() {
    return this.prisma.organization.create({
      data: {
        name: PHARMACY_ORG_NAME,
        slug: PHARMACY_ORG_SLUG,
        email: PHARMACY_ADMIN_EMAIL,
        address: 'Aminu Kano Crescent, Wuse II, Abuja',
        businessType: 'Pharmacy',
        enabledModules: 'POS',
        posMode: 'RETAIL',
        shiftStartTime: PHARMACY_SHIFT_START_TIME,
        shiftEndTime: PHARMACY_SHIFT_END_TIME,
        ...PHARMACY_ORG_SETTINGS,
        planTier: 'BUSINESS',
        subscriptionStatus: 'ACTIVE',
        isGrandfathered: true,
        isTestAccount: true,
        onboardingDismissedAt: new Date(),
      },
    });
  }

  private async ensureStaff(organizationId: string): Promise<{ staff: PharmacyStaff; adminPassword: string | null }> {
    let adminPassword: string | null = null;
    const admin = await this.prisma.user.findUnique({ where: { email: PHARMACY_ADMIN_EMAIL } });
    if (admin && admin.organizationId !== organizationId) {
      throw new BadRequestException(`${PHARMACY_ADMIN_EMAIL} already belongs to another organization`);
    }
    if (!admin) {
      adminPassword = randomBytes(9).toString('base64url');
      await this.prisma.user.create({
        data: {
          organizationId,
          email: PHARMACY_ADMIN_EMAIL,
          passwordHash: await bcrypt.hash(adminPassword, 12),
          firstName: 'Meridian',
          lastName: 'Demo',
          roles: ['SUPER_ADMIN'],
          isEmailVerified: true,
        },
      });
    }

    for (const member of PHARMACY_STAFF) {
      const email = `${member.firstName}.${member.lastName}@${PHARMACY_STAFF_EMAIL_DOMAIN}`.toLowerCase();
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
    await this.prisma.inventoryItem.deleteMany({ where });
    await this.prisma.orderType.deleteMany({ where });
    await this.prisma.paymentType.deleteMany({ where });
  }

  private async populate(organizationId: string, staff: PharmacyStaff, now: Date) {
    await this.wipe(organizationId);
    const itemId = await this.createReferenceData(organizationId);
    const customers = await this.createCustomers(organizationId);
    await this.createHistory(organizationId, staff, itemId, customers, now);
  }

  /** Order/payment types and the barcoded catalogue. Returns product name → InventoryItem id. */
  private async createReferenceData(organizationId: string) {
    await this.prisma.orderType.create({
      data: { organizationId, name: PHARMACY_ORDER_TYPE, requiresTable: false, sortOrder: 0 },
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
    const rng = createRng(20261110);
    const combos = FIRST_NAMES.flatMap((first) => LAST_NAMES.map((last) => `${first} ${last}`));
    for (let i = combos.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [combos[i], combos[j]] = [combos[j], combos[i]];
    }
    const customers: DemoCustomer[] = combos.slice(0, PHARMACY_CUSTOMER_COUNT).map((name, i) => ({
      id: randomUUID(),
      name,
      creditLimit: i < PHARMACY_REGULAR_COUNT + PHARMACY_EXTRA_WALLET_CUSTOMERS ? randInt(rng, 1, 6) * 25_000 : 0,
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
    staff: PharmacyStaff,
    itemId: Map<string, string>,
    customers: DemoCustomer[],
    now: Date,
  ) {
    const todayKey = pharmacyDayKey(now);
    const priceChangeAt = pharmacyOpeningTime(addDays(todayKey, -PHARMACY_PRICE_CHANGE.daysAgo));
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

    for (let daysAgo = PHARMACY_HISTORY_DAYS; daysAgo >= 0; daysAgo--) {
      const key: DayKey = addDays(todayKey, -daysAgo);
      const rng = rngFor(`pharmacy-day:${key}`);
      const dayPayments: { method: string; amount: number }[] = [];
      const manualTransferOrders: { id: string; total: number; closedAt: Date }[] = [];

      // Wallet top-ups: patients on account settle up every so often; a few prepay.
      for (const customer of walletCustomers) {
        const at = pharmacySaleTime(rng, key);
        if (at > now) continue;
        if (customer.balance < -0.5 * customer.creditLimit && rng() < 0.4) {
          moveWallet(customer, Math.ceil(-customer.balance / 5000) * 5000, at, { notes: 'Top-up via Bank Transfer' });
        } else if (customer.balance >= 0 && customer.balance < 25_000 && rng() < 0.03) {
          moveWallet(customer, randInt(rng, 2, 6) * 10_000, at, { notes: 'Top-up via Card' });
        }
      }

      const count = pharmacyOrderCount(key, daysAgo);
      const planned = Array.from({ length: count }, () => pharmacySaleTime(rng, key)).sort((a, b) => a.getTime() - b.getTime());

      for (const createdAt of planned) {
        if (createdAt > now) break;
        const orderRng = createRng(Math.floor(rng() * 2 ** 32));
        const id = randomUUID();
        const closedAt = new Date(Math.min(createdAt.getTime() + checkoutMinutes(orderRng) * 60_000, now.getTime()));

        const customer = this.pickCustomer(orderRng, customers);
        const lines = planPharmacyBasket(orderRng).map((line) => ({
          ...line,
          price: line.name === PHARMACY_PRICE_CHANGE.itemName && createdAt < priceChangeAt ? PHARMACY_PRICE_CHANGE.oldPrice : line.price,
        }));
        const total = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
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
          const kind = pickPharmacyPaymentKind(orderRng, walletAllowed);
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
          source: PHARMACY_ORDER_TYPE,
          status: cancelled ? 'CANCELLED' : 'CLOSED_PAID',
          subtotal: total,
          taxAmount: 0,
          total,
          amountPaid,
          vatApplied: false,
          entertainmentTaxApplied: false,
          serviceChargeApplied: false,
          vatAmount: 0,
          entertainmentTaxAmount: 0,
          serviceChargeAmount: 0,
          closedAt: cancelled ? undefined : closedAt,
          createdAt,
        });
      }

      transfers.push(...this.planTransfers(rng, organizationId, staff, manualTransferOrders, key, now, daysAgo));

      const closesAt = new Date(pharmacyClosingTime(key).getTime() + SHIFT_CLOSES_AFTER_MIN * 60_000);
      if (now >= closesAt) {
        shifts.push(this.planShift(rng, organizationId, staff, key, dayPayments, breakdowns));
      } else if (daysAgo === 0 && now >= new Date(pharmacyOpeningTime(key).getTime() - SHIFT_OPENS_BEFORE_MIN * 60_000)) {
        // Today's shift is still running; PharmacyLiveService closes it after hours.
        shifts.push({
          id: randomUUID(),
          organizationId,
          openedById: staff.cashierIds[0],
          openingFloat: 20_000,
          openedAt: new Date(pharmacyOpeningTime(key).getTime() - SHIFT_OPENS_BEFORE_MIN * 60_000),
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
      `Demo pharmacy history: ${orders.length} sales, ${payments.length} payments, ${walletTx.length} wallet movements, ${movements.length} stock movements`,
    );
  }

  private planMovements(itemId: Map<string, string>, sales: StockSale[], now: Date): PlannedStockMovement[] {
    const todayKey = pharmacyDayKey(now);
    return planStockMovements(
      PRODUCTS.map((p) => ({ id: itemId.get(p.name)!, name: p.name, finalOnHand: p.onHand, lowStock: LOW_STOCK_NAMES.has(p.name) })),
      sales,
      EXPIRY_WRITE_OFFS.filter(([, , daysAgo]) => daysAgo <= PHARMACY_STOCK_WINDOW_DAYS).map(([name, quantity, daysAgo]) => ({
        itemId: itemId.get(name)!,
        quantity,
        at: new Date(pharmacyOpeningTime(addDays(todayKey, -daysAgo)).getTime() + 9 * 60 * 60_000),
        notes: 'Expired stock written off',
      })),
      now,
      PHARMACY_STOCK_WINDOW_DAYS,
    );
  }

  /** Most walk-ins are anonymous; some attach a repeat patient, regulars far more often. */
  private pickCustomer(rng: () => number, customers: DemoCustomer[]): DemoCustomer | undefined {
    if (rng() > PHARMACY_CUSTOMER_RATE) return undefined;
    return rng() < 0.4 ? customers[randInt(rng, 0, PHARMACY_REGULAR_COUNT - 1)] : pick(rng, customers);
  }

  private planShift(
    rng: () => number,
    organizationId: string,
    staff: PharmacyStaff,
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
      openedAt: new Date(pharmacyOpeningTime(key).getTime() - SHIFT_OPENS_BEFORE_MIN * 60_000),
      closedAt: new Date(pharmacyClosingTime(key).getTime() + SHIFT_CLOSES_AFTER_MIN * 60_000),
    };
  }

  /**
   * Moniepoint transfers the webhook couldn't match: most history ones were later assigned to the
   * sale a cashier had paid by hand; the last couple of days leave a few in the review queue.
   */
  private planTransfers(
    rng: () => number,
    organizationId: string,
    staff: PharmacyStaff,
    manualTransferOrders: { id: string; total: number; closedAt: Date }[],
    key: DayKey,
    now: Date,
    daysAgo: number,
  ): Prisma.MoniepointUnreconciledTransferCreateManyInput[] {
    const rows: Prisma.MoniepointUnreconciledTransferCreateManyInput[] = [];
    const sender = () => ({
      customerName: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`.toUpperCase(),
      customerBank: pick(rng, SENDER_BANKS),
      narration: 'Payment for drugs',
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
        const createdAt = pharmacySaleTime(rng, key);
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
