import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma';
import {
  CUSTOMER_COUNT,
  DEMO_ADMIN_EMAIL,
  DEMO_ORG_NAME,
  DEMO_ORG_SLUG,
  DEMO_STAFF_EMAIL_DOMAIN,
  EXTRA_WALLET_CUSTOMERS,
  FIRST_NAMES,
  HISTORY_DAYS,
  INVENTORY,
  LAST_NAMES,
  MENU,
  ORDER_TYPES,
  ORG_SETTINGS,
  PAYMENT_METHOD_FOR,
  PAYMENT_TYPES,
  PRICE_CHANGE,
  RECIPES,
  REGULAR_COUNT,
  SENDER_BANKS,
  SHIFT_END_TIME,
  SHIFT_START_TIME,
  STAFF,
  TABLES,
} from './demo.constants';
import {
  DayKey,
  Rng,
  addDays,
  businessDayKey,
  closingTime,
  computeCharges,
  createRng,
  dwellMinutes,
  lagosDate,
  moniepointReference,
  openingTime,
  pick,
  pickOrderType,
  pickPaymentKind,
  planBasket,
  plannedOrderCount,
  randInt,
  rngFor,
  sampleOrderTime,
} from './demo-plan';

const CHUNK = 2000;

export interface DemoStaff {
  adminId: string;
  cashierIds: string[];
  waiterIds: string[];
}

interface DemoCustomer {
  id: string;
  name: string;
  creditLimit: number;
  balance: number;
}

/**
 * Creates (or wipes and rebuilds) the "The Courtyard Maitama" sales-demo organization: reference
 * data plus HISTORY_DAYS of order history written in bulk with backdated timestamps. Today's
 * activity after the reset is driven by DemoLiveService through the real order services.
 *
 * Only ever touches the org with slug DEMO_ORG_SLUG, and refuses to run if that org is not flagged
 * isTestAccount — a reset deletes all of the org's POS data.
 */
@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger(DemoSeedService.name);
  private populating = false;

  constructor(private readonly prisma: PrismaService) {}

  isPopulating() {
    return this.populating;
  }

  async findDemoOrg() {
    return this.prisma.organization.findUnique({ where: { slug: DEMO_ORG_SLUG } });
  }

  /**
   * Resets the demo org. Creates the org and its logins synchronously (returning the admin
   * password only when the admin login is first created), then rebuilds the data in the
   * background — a full rebuild writes ~10k orders and can outlast an HTTP request.
   */
  async reset(now = new Date()) {
    if (this.populating) throw new BadRequestException('A demo reset is already running');

    const existing = await this.findDemoOrg();
    if (existing && !existing.isTestAccount) {
      throw new BadRequestException(`Organization ${existing.id} has the demo slug but is not a test account — refusing to reset it`);
    }
    const org = existing ?? (await this.createOrg());
    const { staff, adminPassword } = await this.ensureStaff(org.id);

    this.populating = true;
    void this.populate(org.id, staff, now)
      .then(() => this.logger.log(`Demo org ${org.id} rebuilt`))
      .catch((err) => this.logger.error(`Demo org ${org.id} rebuild failed: ${err.message}`, err.stack))
      .finally(() => (this.populating = false));

    return {
      organizationId: org.id,
      adminEmail: DEMO_ADMIN_EMAIL,
      adminPassword,
      status: 'Rebuilding demo data in the background — usually done within a few minutes.',
    };
  }

  async loadStaff(organizationId: string): Promise<DemoStaff> {
    const users = await this.prisma.user.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, email: true, roles: true },
    });
    const admin = users.find((u) => u.email === DEMO_ADMIN_EMAIL);
    if (!admin) throw new BadRequestException('Demo admin login is missing — run a demo reset');
    return {
      adminId: admin.id,
      cashierIds: users.filter((u) => u.roles.includes('CASHIER')).map((u) => u.id),
      waiterIds: users.filter((u) => u.roles.includes('WAITER')).map((u) => u.id),
    };
  }

  private async createOrg() {
    return this.prisma.organization.create({
      data: {
        name: DEMO_ORG_NAME,
        slug: DEMO_ORG_SLUG,
        email: DEMO_ADMIN_EMAIL,
        address: 'Maitama, Abuja',
        businessType: 'Restaurant',
        enabledModules: 'POS',
        posMode: 'RESTAURANT',
        shiftStartTime: SHIFT_START_TIME,
        shiftEndTime: SHIFT_END_TIME,
        ...ORG_SETTINGS,
        planTier: 'BUSINESS',
        subscriptionStatus: 'ACTIVE',
        isGrandfathered: true,
        isTestAccount: true,
        onboardingDismissedAt: new Date(),
      },
    });
  }

  private async ensureStaff(organizationId: string): Promise<{ staff: DemoStaff; adminPassword: string | null }> {
    let adminPassword: string | null = null;
    const admin = await this.prisma.user.findUnique({ where: { email: DEMO_ADMIN_EMAIL } });
    if (admin && admin.organizationId !== organizationId) {
      throw new BadRequestException(`${DEMO_ADMIN_EMAIL} already belongs to another organization`);
    }
    if (!admin) {
      adminPassword = randomBytes(9).toString('base64url');
      await this.prisma.user.create({
        data: {
          organizationId,
          email: DEMO_ADMIN_EMAIL,
          passwordHash: await bcrypt.hash(adminPassword, 12),
          firstName: 'Courtyard',
          lastName: 'Demo',
          roles: ['SUPER_ADMIN'],
          isEmailVerified: true,
        },
      });
    }

    for (const member of STAFF) {
      const email = `${member.firstName}.${member.lastName}@${DEMO_STAFF_EMAIL_DOMAIN}`.toLowerCase();
      await this.prisma.user.upsert({
        where: { email },
        update: {},
        create: {
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
    await this.prisma.menuItem.deleteMany({ where });
    await this.prisma.menuCategory.deleteMany({ where });
    await this.prisma.inventoryItem.deleteMany({ where });
    await this.prisma.restaurantTable.deleteMany({ where });
    await this.prisma.orderType.deleteMany({ where });
    await this.prisma.paymentType.deleteMany({ where });
  }

  private async populate(organizationId: string, staff: DemoStaff, now: Date) {
    await this.wipe(organizationId);
    const reference = await this.createReferenceData(organizationId);
    const customers = await this.createCustomers(organizationId);
    await this.createHistory(organizationId, staff, reference, customers, now);
  }

  private async createReferenceData(organizationId: string) {
    await this.prisma.orderType.createMany({
      data: ORDER_TYPES.map((t, i) => ({ organizationId, name: t.name, requiresTable: t.requiresTable, sortOrder: i })),
    });
    await this.prisma.paymentType.createMany({
      data: PAYMENT_TYPES.map((name, i) => ({ organizationId, name, sortOrder: i })),
    });
    const orderTypes = await this.prisma.orderType.findMany({ where: { organizationId } });
    const orderTypeId = new Map(orderTypes.map((t) => [t.name, t.id]));

    const tables = TABLES.map((t, i) => ({
      id: randomUUID(),
      organizationId,
      name: t.name,
      section: t.section,
      capacity: t.capacity,
      sortOrder: i,
      orderTypeId: orderTypeId.get(t.orderType),
      orderType: t.orderType,
    }));
    await this.prisma.restaurantTable.createMany({ data: tables.map(({ orderType, ...row }) => row) });

    const categoryRows = MENU.map((c, i) => ({ id: randomUUID(), organizationId, name: c.name, kind: c.kind, sortOrder: i }));
    await this.prisma.menuCategory.createMany({ data: categoryRows });
    const menuItemId = new Map<string, string>();
    const itemRows: Prisma.MenuItemCreateManyInput[] = [];
    const links: Prisma.MenuItemCategoryCreateManyInput[] = [];
    MENU.forEach((category, ci) => {
      for (const item of category.items) {
        const id = randomUUID();
        menuItemId.set(item.name, id);
        itemRows.push({ id, organizationId, name: item.name, price: item.price });
        links.push({ menuItemId: id, categoryId: categoryRows[ci].id });
      }
    });
    await this.prisma.menuItem.createMany({ data: itemRows });
    await this.prisma.menuItemCategory.createMany({ data: links });

    const inventoryId = new Map<string, string>();
    await this.prisma.inventoryItem.createMany({
      data: INVENTORY.map((inv) => {
        const id = randomUUID();
        inventoryId.set(inv.name, id);
        return {
          id,
          organizationId,
          name: inv.name,
          unitOfMeasure: inv.unitOfMeasure,
          unitPrice: inv.unitPrice,
          onHandQuantity: inv.onHand,
          reorderLevel: inv.reorderLevel,
        };
      }),
    });
    await this.prisma.menuItemIngredient.createMany({
      data: Object.entries(RECIPES).flatMap(([itemName, lines]) =>
        lines.map(([inventoryName, quantityPerUnit]) => ({
          menuItemId: menuItemId.get(itemName)!,
          inventoryItemId: inventoryId.get(inventoryName)!,
          quantityPerUnit,
        })),
      ),
    });

    return {
      menuItemId,
      dineInTables: tables.filter((t) => t.orderType === 'Dine In').map((t) => t.id),
      privateTables: tables.filter((t) => t.orderType === 'Private Dining').map((t) => t.id),
    };
  }

  private async createCustomers(organizationId: string): Promise<DemoCustomer[]> {
    const rng = createRng(20261023);
    const combos = FIRST_NAMES.flatMap((first) => LAST_NAMES.map((last) => `${first} ${last}`));
    for (let i = combos.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [combos[i], combos[j]] = [combos[j], combos[i]];
    }
    const customers: DemoCustomer[] = combos.slice(0, CUSTOMER_COUNT).map((name, i) => ({
      id: randomUUID(),
      name,
      creditLimit: i < REGULAR_COUNT + EXTRA_WALLET_CUSTOMERS ? randInt(rng, 2, 10) * 50_000 : 0,
      balance: 0,
    }));
    await this.prisma.customer.createMany({
      data: customers.map((c, i) => ({
        id: c.id,
        organizationId,
        name: c.name,
        // Fictional numbers in a range not used for real Nigerian mobile lines.
        phone: `+23480000${String(10000 + i)}`,
        creditLimit: c.creditLimit,
      })),
    });
    return customers;
  }

  private async createHistory(
    organizationId: string,
    staff: DemoStaff,
    reference: Awaited<ReturnType<DemoSeedService['createReferenceData']>>,
    customers: DemoCustomer[],
    now: Date,
  ) {
    const todayKey = businessDayKey(now);
    const priceChangeAt = openingTime(addDays(todayKey, -PRICE_CHANGE.daysAgo));
    const walletCustomers = customers.filter((c) => c.creditLimit > 0);

    const orders: Prisma.OrderCreateManyInput[] = [];
    const items: Prisma.OrderItemCreateManyInput[] = [];
    const payments: Prisma.PaymentCreateManyInput[] = [];
    const walletTx: Prisma.WalletTransactionCreateManyInput[] = [];
    const shifts: Prisma.ShiftCreateManyInput[] = [];
    const breakdowns: Prisma.ShiftPaymentBreakdownCreateManyInput[] = [];
    const transfers: Prisma.MoniepointUnreconciledTransferCreateManyInput[] = [];
    const occupiedTables = new Set<string>();

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

    for (let daysAgo = HISTORY_DAYS; daysAgo >= 0; daysAgo--) {
      const key: DayKey = addDays(todayKey, -daysAgo);
      const rng = rngFor(`day:${key}`);
      const isToday = daysAgo === 0;
      const dayPayments: { method: string; amount: number }[] = [];
      const manualTransferOrders: { id: string; total: number; closedAt: Date }[] = [];

      // Wallet top-ups: regulars on credit settle up every so often; a few prepay.
      for (const customer of walletCustomers) {
        const at = sampleOrderTime(rng, key);
        if (at > now) continue;
        if (customer.balance < -0.5 * customer.creditLimit && rng() < 0.4) {
          moveWallet(customer, Math.ceil(-customer.balance / 5000) * 5000, at, { notes: 'Top-up via Bank Transfer' });
        } else if (customer.balance >= 0 && customer.balance < 50_000 && rng() < 0.03) {
          moveWallet(customer, randInt(rng, 2, 8) * 25_000, at, { notes: 'Top-up via Card' });
        }
      }

      const count = plannedOrderCount(key, daysAgo);
      const planned = Array.from({ length: count }, () => sampleOrderTime(rng, key)).sort((a, b) => a.getTime() - b.getTime());

      for (const createdAt of planned) {
        if (createdAt > now) break;
        const orderRng = createRng(Math.floor(rng() * 2 ** 32));
        const id = randomUUID();
        let source = pickOrderType(orderRng);
        const tablePool = source === 'Private Dining' ? reference.privateTables : source === 'Dine In' ? reference.dineInTables : [];
        let tableId: string | undefined = tablePool.length ? pick(orderRng, tablePool) : undefined;

        const closedAt = this.closeTime(orderRng, key, createdAt, source);
        const isOpen = isToday && closedAt > now;
        if (isOpen && tableId) {
          // A table can only hold one open order at a time.
          const free = tablePool.filter((t) => !occupiedTables.has(t));
          if (free.length === 0) {
            source = 'Takeaway';
            tableId = undefined;
          } else {
            tableId = pick(orderRng, free);
            occupiedTables.add(tableId);
          }
        }

        const customer = this.pickCustomer(orderRng, customers, source);
        const waiterId = source !== 'Takeaway' && source !== 'Delivery' && orderRng() < 0.7 ? pick(orderRng, staff.waiterIds) : undefined;
        const lines = planBasket(orderRng, source).map((line) => ({
          ...line,
          price: line.name === PRICE_CHANGE.itemName && createdAt < priceChangeAt ? PRICE_CHANGE.oldPrice : line.price,
        }));
        const charges = computeCharges(lines.reduce((sum, l) => sum + l.price * l.quantity, 0));
        const cancelled = !isOpen && orderRng() < 0.05;

        for (const line of lines) {
          items.push({
            orderId: id,
            menuItemId: reference.menuItemId.get(line.name),
            itemName: line.name,
            quantity: line.quantity,
            unitPrice: line.price,
            amount: line.price * line.quantity,
            status: isOpen ? (now.getTime() - createdAt.getTime() > 10 * 60_000 ? 'ON_IT' : 'PENDING') : 'SERVED',
            servedAt: isOpen || cancelled ? undefined : closedAt,
            createdAt,
          });
        }

        let amountPaid = 0;
        if (!isOpen && !cancelled) {
          const walletAllowed = !!customer && customer.creditLimit > 0 && customer.balance - charges.total >= -customer.creditLimit;
          const kind = pickPaymentKind(orderRng, walletAllowed);
          const paymentId = randomUUID();
          const isAuto = kind === 'AUTO_TRANSFER' || kind === 'AUTO_POS';
          // Some auto-matched transfers land a few kobo short and are written off, like real ones.
          const shortfall = isAuto && orderRng() < 0.15 ? 0.5 : 0;
          const amount = Math.round((charges.total - shortfall) * 100) / 100;
          payments.push({
            id: paymentId,
            organizationId,
            orderId: id,
            recordedById: isAuto ? undefined : pick(orderRng, staff.cashierIds),
            amount,
            paymentMethod: PAYMENT_METHOD_FOR[kind],
            paymentDate: lagosDate(closedAt),
            isAutoRecorded: isAuto,
            moniepointReference: isAuto ? moniepointReference(orderRng, kind, closedAt) : undefined,
            notes: shortfall ? `Received ₦${amount} — ₦${shortfall} shortfall written off (within tolerance)` : undefined,
            createdAt: closedAt,
          });
          dayPayments.push({ method: PAYMENT_METHOD_FOR[kind], amount });
          if (kind === 'WALLET' && customer) {
            moveWallet(customer, -charges.total, closedAt, { type: 'ORDER_DEBIT', orderId: id, paymentId });
          }
          if (kind === 'MANUAL_TRANSFER') manualTransferOrders.push({ id, total: charges.total, closedAt });
          amountPaid = charges.total;
        }

        orders.push({
          id,
          organizationId,
          tableId,
          customerId: customer?.id,
          waiterId,
          createdById: pick(orderRng, staff.cashierIds),
          source,
          status: isOpen ? 'OPEN' : cancelled ? 'CANCELLED' : 'CLOSED_PAID',
          subtotal: charges.subtotal,
          taxAmount: charges.taxAmount,
          total: charges.total,
          amountPaid,
          vatApplied: true,
          entertainmentTaxApplied: true,
          serviceChargeApplied: true,
          vatAmount: charges.vatAmount,
          entertainmentTaxAmount: charges.entertainmentTaxAmount,
          serviceChargeAmount: charges.serviceChargeAmount,
          closedAt: isOpen || cancelled ? undefined : closedAt,
          createdAt,
        });
      }

      transfers.push(...this.planTransfers(rng, organizationId, staff, manualTransferOrders, key, now, daysAgo));
      if (!isToday) shifts.push(this.planShift(rng, organizationId, staff, key, dayPayments, breakdowns));
    }

    // Today's shift is still running; DemoLiveService closes it after hours (and opens it, if
    // this reset ran before opening time).
    const todayShiftOpensAt = new Date(openingTime(todayKey).getTime() - 15 * 60_000);
    if (now >= todayShiftOpensAt) {
      shifts.push({ id: randomUUID(), organizationId, openedById: staff.cashierIds[0], openingFloat: 50_000, openedAt: todayShiftOpensAt });
    }

    await this.insertInChunks((data) => this.prisma.order.createMany({ data }), orders);
    await this.insertInChunks((data) => this.prisma.orderItem.createMany({ data }), items);
    await this.insertInChunks((data) => this.prisma.payment.createMany({ data }), payments);
    await this.insertInChunks((data) => this.prisma.walletTransaction.createMany({ data }), walletTx);
    await this.insertInChunks((data) => this.prisma.shift.createMany({ data }), shifts);
    await this.insertInChunks((data) => this.prisma.shiftPaymentBreakdown.createMany({ data }), breakdowns);
    await this.insertInChunks((data) => this.prisma.moniepointUnreconciledTransfer.createMany({ data }), transfers);

    for (const customer of walletCustomers.filter((c) => c.balance !== 0)) {
      await this.prisma.customer.update({ where: { id: customer.id }, data: { walletBalance: customer.balance } });
    }
    if (occupiedTables.size) {
      await this.prisma.restaurantTable.updateMany({ where: { id: { in: [...occupiedTables] } }, data: { status: 'OCCUPIED' } });
    }
    this.logger.log(`Demo history: ${orders.length} orders, ${payments.length} payments, ${walletTx.length} wallet movements`);
  }

  /** When an order gets paid — clamped so nothing settles long after the kitchen closes. */
  private closeTime(rng: Rng, key: DayKey, createdAt: Date, source: string): Date {
    const latest = closingTime(key).getTime() + 5 * 60_000;
    const planned = createdAt.getTime() + dwellMinutes(rng, source) * 60_000;
    return new Date(Math.max(Math.min(planned, latest), createdAt.getTime() + 5 * 60_000));
  }

  private pickCustomer(rng: Rng, customers: DemoCustomer[], source: string): DemoCustomer | undefined {
    if (rng() > (source === 'Delivery' ? 0.9 : 0.55)) return undefined;
    return rng() < 0.3 ? customers[randInt(rng, 0, REGULAR_COUNT - 1)] : pick(rng, customers);
  }

  private planShift(
    rng: Rng,
    organizationId: string,
    staff: DemoStaff,
    key: DayKey,
    dayPayments: { method: string; amount: number }[],
    breakdowns: Prisma.ShiftPaymentBreakdownCreateManyInput[],
  ): Prisma.ShiftCreateManyInput {
    const id = randomUUID();
    const openingFloat = 50_000;
    const totals = new Map<string, number>([['CASH', 0]]);
    for (const p of dayPayments) totals.set(p.method, (totals.get(p.method) ?? 0) + p.amount);

    const expectedCash = openingFloat + (totals.get('CASH') ?? 0);
    // Most nights the till balances; some nights it's a little short.
    const cashVariance = rng() < 0.3 ? -randInt(rng, 1, 6) * 500 : 0;
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
      openedAt: new Date(openingTime(key).getTime() - 15 * 60_000),
      closedAt: new Date(closingTime(key).getTime() + 10 * 60_000),
    };
  }

  /**
   * Moniepoint transfers the webhook couldn't match: most history ones were later assigned to the
   * order a cashier had paid by hand; the last couple of days leave a few in the review queue.
   */
  private planTransfers(
    rng: Rng,
    organizationId: string,
    staff: DemoStaff,
    manualTransferOrders: { id: string; total: number; closedAt: Date }[],
    key: DayKey,
    now: Date,
    daysAgo: number,
  ): Prisma.MoniepointUnreconciledTransferCreateManyInput[] {
    const rows: Prisma.MoniepointUnreconciledTransferCreateManyInput[] = [];
    const sender = () => ({
      customerName: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`.toUpperCase(),
      customerBank: pick(rng, SENDER_BANKS),
      narration: 'Payment for food',
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
        const createdAt = sampleOrderTime(rng, key);
        if (createdAt > now) continue;
        rows.push({
          organizationId,
          source: rng() < 0.8 ? 'TRANSFER' : 'CARD',
          amount: randInt(rng, 6, 90) * 250,
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

