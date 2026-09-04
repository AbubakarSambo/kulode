import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { WalletService } from '../wallet/wallet.service';
import { SheetSyncService } from '../sheet-sync';
import { PrintingService } from '../printers';
import { OrderTypesService } from '../order-types';
import { PaymentTypesService } from '../payment-types';
import {
  CreateOrderDto,
  AddOrderItemsDto,
  UpdateOrderItemStatusDto,
  UpdateOrderItemDto,
  UpdateOrderCustomerDto,
  UpdateOrderWaiterDto,
  UpdateOrderNotesDto,
  UpdateOrderSourceDto,
  CloseOrderDto,
  OrderFilterDto,
  MoveOrderItemsDto,
  ApplyDiscountDto,
} from './dto';
import { paginate, runIdempotent } from '../../common';

const OPEN_STATUSES: OrderStatus[] = [OrderStatus.OPEN, OrderStatus.IN_KITCHEN, OrderStatus.READY];
// CLOSED_UNPAID means "a waiter marked this ready for payment, a cashier hasn't taken it yet" —
// still voidable, and still eligible to be closed out with an actual payment.
const VOIDABLE_STATUSES: OrderStatus[] = [...OPEN_STATUSES, OrderStatus.CLOSED_UNPAID];
const PAYABLE_STATUSES: OrderStatus[] = [...OPEN_STATUSES, OrderStatus.CLOSED_UNPAID];

function toNumber(val: Prisma.Decimal | number): number {
  return typeof val === 'number' ? val : Number(val);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// "30/08/2026" — matches the org's spreadsheet export format.
function formatSheetDate(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

// "Aug 2026"
function formatSheetMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatSheetTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

// v1: string-match the item's first menu category against "bar" — everything else is Kitchen.
// Revisit with an explicit MenuCategory.prepStation field if categories start overlapping.
function resolveSalesArea1(categoryName: string | undefined): string {
  return categoryName?.toLowerCase().includes('bar') ? 'Bar' : 'Kitchen';
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private walletService: WalletService,
    private sheetSync: SheetSyncService,
    private printingService: PrintingService,
    private orderTypesService: OrderTypesService,
    private paymentTypesService: PaymentTypesService,
  ) {}

  // Fires kitchen/bar dockets for newly created order items. Run after the DB transaction
  // commits (never inside it — this does real network I/O) and never awaited by the caller —
  // a printer being offline must not slow down or fail the waiter's "place order" request.
  private dispatchPrintDockets(
    organizationId: string,
    order: {
      id: string;
      source: string;
      table?: { name: string } | null;
      waiter?: { firstName: string; lastName: string } | null;
      createdBy?: { firstName: string; lastName: string } | null;
    },
    items: Array<{
      id: string;
      menuItemId: string | null;
      itemName: string;
      quantity: Prisma.Decimal | number;
      notes: string | null;
    }>,
  ): void {
    if (items.length === 0) return;

    this.printingService
      .dispatchDocketsForNewItems(
        organizationId,
        {
          id: order.id,
          tableName: order.table?.name ?? null,
          // Falls back to whoever placed the order when no waiter was assigned.
          waiterName: order.waiter
            ? `${order.waiter.firstName} ${order.waiter.lastName}`
            : order.createdBy
              ? `${order.createdBy.firstName} ${order.createdBy.lastName}`
              : null,
          source: order.source,
        },
        items.map((i) => ({
          id: i.id,
          menuItemId: i.menuItemId,
          itemName: i.itemName,
          quantity: toNumber(i.quantity),
          notes: i.notes,
        })),
      )
      .catch((err) => {
        this.logger.warn(
          `Print dispatch failed for order ${order.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  // Same fire-and-forget contract as dispatchPrintDockets — run after the transaction commits,
  // never awaited, so a printer outage can't slow down or fail the "cancel order" request.
  private dispatchCancellationDocket(
    organizationId: string,
    order: {
      id: string;
      source: string;
      table?: { name: string } | null;
      waiter?: { firstName: string; lastName: string } | null;
      createdBy?: { firstName: string; lastName: string } | null;
    },
    items: Array<{
      id: string;
      menuItemId: string | null;
      itemName: string;
      quantity: Prisma.Decimal | number;
      notes: string | null;
    }>,
  ): void {
    if (items.length === 0) return;

    this.printingService
      .dispatchDocketsForCancellation(
        organizationId,
        {
          id: order.id,
          tableName: order.table?.name ?? null,
          // Falls back to whoever placed the order when no waiter was assigned.
          waiterName: order.waiter
            ? `${order.waiter.firstName} ${order.waiter.lastName}`
            : order.createdBy
              ? `${order.createdBy.firstName} ${order.createdBy.lastName}`
              : null,
          source: order.source,
        },
        items.map((i) => ({
          id: i.id,
          menuItemId: i.menuItemId,
          itemName: i.itemName,
          quantity: toNumber(i.quantity),
          notes: i.notes,
        })),
      )
      .catch((err) => {
        this.logger.warn(
          `Cancellation print dispatch failed for order ${order.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  private readonly orderInclude = {
    table: { select: { id: true, name: true, section: true } },
    customer: { select: { id: true, name: true, phone: true } },
    waiter: { select: { id: true, firstName: true, lastName: true, phone: true } },
    createdBy: { select: { id: true, firstName: true, lastName: true } },
    items: {
      // `id` breaks ties: items on the same order are created together in one nested `create`,
      // so they share an identical `createdAt` — sorting on that alone left Postgres free to
      // return them in either order on different query executions (the "swap" on every refetch).
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] as Prisma.OrderItemOrderByWithRelationInput[],
      include: {
        menuItem: {
          select: {
            id: true,
            name: true,
            durationMinutes: true,
            categories: { include: { category: { select: { name: true } } } },
          },
        },
      },
    },
    payments: true,
  } as const;

  // For list views (e.g. the table floor board) that only render a couple of scalar fields per
  // order but were paying for the full items/menuItem/categories/payments graph above, fetched
  // and discarded, on every poll.
  private readonly orderSummarySelect = {
    id: true,
    tableId: true,
    status: true,
    total: true,
    waiter: { select: { id: true, firstName: true, lastName: true } },
    createdBy: { select: { id: true, firstName: true, lastName: true } },
  } as const;

  async findAll(organizationId: string, filter: OrderFilterDto) {
    const { page = 1, limit = 20, status, statuses, tableId, customerId, waiterId, summary } = filter;
    const skip = (page - 1) * limit;
    const where = {
      organizationId,
      ...(statuses && statuses.length > 0 ? { status: { in: statuses } } : status && { status }),
      ...(tableId && { tableId }),
      ...(customerId && { customerId }),
      ...(waiterId && { waiterId }),
    };

    const [orders, total] = await Promise.all([
      summary
        ? this.prisma.order.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, select: this.orderSummarySelect })
        : this.prisma.order.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: this.orderInclude }),
      this.prisma.order.count({ where }),
    ]);

    return paginate(orders, total, page, limit);
  }

  async findOne(organizationId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, organizationId },
      include: this.orderInclude,
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async priceItems(
    organizationId: string,
    items: Array<{ menuItemId: string; quantity: number; notes?: string }>,
  ) {
    const menuItemIds = [...new Set(items.map((i) => i.menuItemId))];
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, organizationId },
    });

    const byId = new Map(menuItems.map((m) => [m.id, m]));

    return items.map((item) => {
      const menuItem = byId.get(item.menuItemId);
      if (!menuItem) {
        throw new NotFoundException(`Menu item ${item.menuItemId} not found`);
      }
      if (!menuItem.isAvailable) {
        throw new BadRequestException(`"${menuItem.name}" is currently unavailable`);
      }
      const unitPrice = toNumber(menuItem.price);
      return {
        menuItemId: menuItem.id,
        itemName: menuItem.name,
        quantity: item.quantity,
        unitPrice,
        amount: Math.round(unitPrice * item.quantity * 100) / 100,
        notes: item.notes,
      };
    });
  }

  async create(organizationId: string, userId: string, dto: CreateOrderDto) {
    const source = dto.source ?? 'Dine In';
    const sourceRequiresTable = await this.orderTypesService.requiresTable(organizationId, source);

    if (sourceRequiresTable && !dto.tableId) {
      throw new BadRequestException(`tableId is required for ${source} orders`);
    }

    if (dto.tableId) {
      const table = await this.prisma.restaurantTable.findFirst({
        where: { id: dto.tableId, organizationId, isActive: true },
      });
      if (!table) throw new NotFoundException('Table not found');
    }

    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, organizationId },
      });
      if (!customer) throw new NotFoundException('Customer not found');
    }

    if (dto.waiterId) {
      const waiter = await this.prisma.user.findFirst({
        where: { id: dto.waiterId, organizationId, isActive: true, roles: { has: 'WAITER' } },
      });
      if (!waiter) throw new NotFoundException('Waiter not found');
    }

    const pricedItems = await this.priceItems(organizationId, dto.items);
    const subtotal = pricedItems.reduce((sum, i) => sum + i.amount, 0);

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });

    // Each charge type only applies at all if the org has it enabled; when enabled, it defaults
    // to "on" for a new order (matching the old always-on behavior) unless explicitly toggled off.
    const applyVat = organization.vatEnabled && (dto.applyVat ?? true);
    const applyEntertainmentTax = organization.entertainmentTaxEnabled && (dto.applyEntertainmentTax ?? true);
    const applyServiceCharge = organization.serviceChargeEnabled && (dto.applyServiceCharge ?? true);
    const { vatAmount, entertainmentTaxAmount, serviceChargeAmount, taxAmount } = this.computeOrderCharges(
      subtotal,
      organization,
      applyVat,
      applyEntertainmentTax,
      applyServiceCharge,
    );
    const total = subtotal + taxAmount + serviceChargeAmount;

    let isFreshExecution = false;
    const created = await runIdempotent(this.prisma, organizationId, 'ORDER_CREATE', dto.clientRequestId, async (tx) => {
      isFreshExecution = true;
      const created = await tx.order.create({
        data: {
          organizationId,
          tableId: dto.tableId,
          customerId: dto.customerId,
          waiterId: dto.waiterId,
          createdById: userId,
          source,
          subtotal,
          taxAmount,
          vatApplied: applyVat,
          entertainmentTaxApplied: applyEntertainmentTax,
          serviceChargeApplied: applyServiceCharge,
          vatAmount,
          entertainmentTaxAmount,
          serviceChargeAmount,
          total,
          notes: dto.notes,
          items: { create: pricedItems },
        },
        include: this.orderInclude,
      });

      if (dto.tableId) {
        await tx.restaurantTable.update({
          where: { id: dto.tableId },
          data: { status: 'OCCUPIED' },
        });
      }

      return created;
    });

    // Skipped on an idempotent replay (isFreshExecution stays false) — a retried
    // "place order" request must not print the same docket twice.
    if (isFreshExecution) {
      this.dispatchPrintDockets(organizationId, created, created.items);
    }

    return created;
  }

  async addItems(organizationId: string, id: string, dto: AddOrderItemsDto) {
    const order = await this.prisma.order.findFirst({ where: { id, organizationId } });
    if (!order) throw new NotFoundException('Order not found');
    // CLOSED_UNPAID (marked "awaiting payment") is still addable — e.g. a guest orders dessert
    // while waiting to settle up. Reverting it to OPEN below is what actually matters: it pulls
    // the order back out of the cashier's "ready to collect" queue until the kitchen genuinely
    // finishes the new items, so no one takes payment on food that isn't out yet.
    if (!VOIDABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(`Cannot add items to a ${order.status.toLowerCase()} order`);
    }
    const reopening = order.status === OrderStatus.CLOSED_UNPAID;
    if (toNumber(order.discountAmount) > 0) {
      throw new BadRequestException('This order has a discount applied — clear it before adding items');
    }

    const pricedItems = await this.priceItems(organizationId, dto.items);
    const addedAmount = pricedItems.reduce((sum, i) => sum + i.amount, 0);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });

    const newSubtotal = toNumber(order.subtotal) + addedAmount;
    // Which charges apply was already decided at order creation — adding items recalculates the
    // amounts against the org's current rates, but never silently turns a charge on/off mid-order.
    const { vatAmount, entertainmentTaxAmount, serviceChargeAmount, taxAmount: newTaxAmount } = this.computeOrderCharges(
      newSubtotal,
      organization,
      order.vatApplied,
      order.entertainmentTaxApplied,
      order.serviceChargeApplied,
    );
    const newTotal = newSubtotal + newTaxAmount + serviceChargeAmount;

    let isFreshExecution = false;
    let newItemIds: string[] = [];
    const updated = await runIdempotent(this.prisma, organizationId, 'ORDER_ADD_ITEMS', dto.clientRequestId, async (tx) => {
      isFreshExecution = true;
      // Created individually (not createMany) so we get each new item's id back — needed to
      // pick out just the newly added items below for print dispatch, without reprinting the
      // rest of the order's existing items.
      const createdItems = await Promise.all(
        pricedItems.map((i) => tx.orderItem.create({ data: { ...i, orderId: id } })),
      );
      newItemIds = createdItems.map((i) => i.id);

      return tx.order.update({
        where: { id },
        data: {
          subtotal: newSubtotal,
          taxAmount: newTaxAmount,
          vatAmount,
          entertainmentTaxAmount,
          serviceChargeAmount,
          total: newTotal,
          ...(reopening && { status: OrderStatus.OPEN, closedAt: null }),
        },
        include: this.orderInclude,
      });
    });

    if (isFreshExecution) {
      const newItems = updated.items.filter((i) => newItemIds.includes(i.id));
      this.dispatchPrintDockets(organizationId, updated, newItems);
    }

    return updated;
  }

  // "Charges" rather than "tax" since service charge is a fee, not a tax — kept out of taxAmount,
  // callers add serviceChargeAmount into the order total separately.
  private computeOrderCharges(
    subtotal: number,
    organization: {
      taxRate: Prisma.Decimal | number;
      entertainmentTaxRate: Prisma.Decimal | number;
      serviceChargeRate: Prisma.Decimal | number;
    },
    applyVat: boolean,
    applyEntertainmentTax: boolean,
    applyServiceCharge: boolean,
  ) {
    const vatRate = applyVat ? toNumber(organization.taxRate) : 0;
    const entertainmentRate = applyEntertainmentTax ? toNumber(organization.entertainmentTaxRate) : 0;
    const serviceChargeRate = applyServiceCharge ? toNumber(organization.serviceChargeRate) : 0;
    const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100;
    const entertainmentTaxAmount = Math.round(subtotal * (entertainmentRate / 100) * 100) / 100;
    const serviceChargeAmount = Math.round(subtotal * (serviceChargeRate / 100) * 100) / 100;
    return { vatAmount, entertainmentTaxAmount, serviceChargeAmount, taxAmount: vatAmount + entertainmentTaxAmount };
  }

  async updateItemStatus(
    organizationId: string,
    orderId: string,
    itemId: string,
    dto: UpdateOrderItemStatusDto,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, organizationId },
      include: this.orderInclude,
    });
    if (!order) throw new NotFoundException('Order not found');

    const item = order.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Order item not found');

    // Roll the order-level status up from its items so front-of-house and kitchen views agree.
    // Computed against the already-fetched items (patched in memory) rather than a re-fetch.
    const items = order.items.map((i) => (i.id === itemId ? { ...i, status: dto.status } : i));
    let newOrderStatus: 'IN_KITCHEN' | 'READY' | undefined;
    if (items.every((i) => i.status === 'PASS' || i.status === 'SERVED')) {
      newOrderStatus = 'READY';
    } else if (items.some((i) => i.status === 'ON_IT' || i.status === 'PASS' || i.status === 'SERVED')) {
      newOrderStatus = 'IN_KITCHEN';
    }
    const willTransitionOrder = !!newOrderStatus && OPEN_STATUSES.includes(order.status);

    // Batched into one round trip (each `await this.prisma.X` is a separate network hop against
    // the hosted DB — that's what was turning this endpoint into a multi-second wait in prod).
    await this.prisma.$transaction([
      this.prisma.orderItem.update({ where: { id: itemId }, data: { status: dto.status } }),
      ...(willTransitionOrder
        ? [this.prisma.order.update({ where: { id: orderId }, data: { status: newOrderStatus } })]
        : []),
    ]);

    // Build the response from data already in hand instead of a third round trip — table,
    // customer, waiter and payments are all unaffected by an item status change.
    return { ...order, items, status: willTransitionOrder ? newOrderStatus! : order.status };
  }

  /**
   * Edits a line's quantity (or removes it entirely at quantity 0). Restricted to PENDING items —
   * once the kitchen's actually started on it, changing the order is a cancel/re-add conversation,
   * not a quiet quantity edit. Same no-payment-yet guard as merge/move; removing the last item
   * cancels the order rather than leaving it with zero, matching moveItems' behavior.
   */
  async updateItem(organizationId: string, orderId: string, itemId: string, dto: UpdateOrderItemDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, organizationId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!OPEN_STATUSES.includes(order.status)) {
      throw new BadRequestException(`Cannot edit items on a ${order.status.toLowerCase()} order`);
    }
    if (toNumber(order.amountPaid) > 0) {
      throw new BadRequestException('This order already has a payment recorded — cannot edit its items');
    }
    if (toNumber(order.discountAmount) > 0) {
      throw new BadRequestException('This order has a discount applied — clear it before editing items');
    }

    const item = order.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Order item not found');
    if (item.status !== 'PENDING') {
      throw new BadRequestException('Cannot edit an item once the kitchen has started on it');
    }

    const remainingItems = order.items.filter((i) => i.id !== itemId);
    // 0 removes the line entirely — its amount just doesn't get added back in below.
    const newAmount = Math.round(toNumber(item.unitPrice) * dto.quantity * 100) / 100;
    const newSubtotal = remainingItems.reduce((sum, i) => sum + toNumber(i.amount), 0) + newAmount;

    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const { vatAmount, entertainmentTaxAmount, serviceChargeAmount, taxAmount } = this.computeOrderCharges(
      newSubtotal,
      organization,
      order.vatApplied,
      order.entertainmentTaxApplied,
      order.serviceChargeApplied,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.quantity === 0) {
        await tx.orderItem.delete({ where: { id: itemId } });
      } else {
        await tx.orderItem.update({
          where: { id: itemId },
          data: { quantity: dto.quantity, amount: newAmount, ...(dto.notes !== undefined && { notes: dto.notes || null }) },
        });
      }

      if (dto.quantity === 0 && remainingItems.length === 0) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'CANCELLED', notes: order.notes ? `${order.notes} — last item removed` : 'Last item removed' },
        });
      } else {
        await tx.order.update({
          where: { id: orderId },
          data: {
            subtotal: newSubtotal,
            taxAmount,
            vatAmount,
            entertainmentTaxAmount,
            serviceChargeAmount,
            total: newSubtotal + taxAmount + serviceChargeAmount,
          },
        });
      }

      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: this.orderInclude });
    });

    // The kitchen/bar already has a docket for this item from the moment the order was placed
    // (dockets print on creation, not on "On It") — so pulling any of it back out, in full or in
    // part, needs its own cancellation docket or the station just keeps making it.
    const removedQty = toNumber(item.quantity) - dto.quantity;
    if (removedQty > 0) {
      this.dispatchCancellationDocket(organizationId, updated, [
        { id: item.id, menuItemId: item.menuItemId, itemName: item.itemName, quantity: removedQty, notes: item.notes },
      ]);
    }

    return updated;
  }

  async setCustomer(organizationId: string, id: string, dto: UpdateOrderCustomerDto) {
    const order = await this.prisma.order.findFirst({ where: { id, organizationId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot change customer on a cancelled order');
    }

    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, organizationId },
      });
      if (!customer) throw new NotFoundException('Customer not found');
    }

    return this.prisma.order.update({
      where: { id },
      data: { customerId: dto.customerId ?? null },
      include: this.orderInclude,
    });
  }

  async setWaiter(organizationId: string, id: string, dto: UpdateOrderWaiterDto) {
    const order = await this.prisma.order.findFirst({ where: { id, organizationId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot change waiter on a cancelled order');
    }

    if (dto.waiterId) {
      const waiter = await this.prisma.user.findFirst({
        where: { id: dto.waiterId, organizationId, isActive: true, roles: { has: 'WAITER' } },
      });
      if (!waiter) throw new NotFoundException('Waiter not found');
    }

    return this.prisma.order.update({
      where: { id },
      data: { waiterId: dto.waiterId ?? null },
      include: this.orderInclude,
    });
  }

  async setNotes(organizationId: string, id: string, dto: UpdateOrderNotesDto) {
    const order = await this.prisma.order.findFirst({ where: { id, organizationId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot change notes on a cancelled order');
    }

    return this.prisma.order.update({
      where: { id },
      data: { notes: dto.notes || null },
      include: this.orderInclude,
    });
  }

  /**
   * Reclassifies an order (e.g. a dine-in party decides to take it to go instead). Switching away
   * from a table-requiring type frees whatever table it was on — the whole point of the change is
   * that no one's sitting there anymore. Switching to a table-requiring type requires a table and
   * occupies it, same as at
   * order creation.
   */
  async setSource(organizationId: string, id: string, dto: UpdateOrderSourceDto) {
    const order = await this.prisma.order.findFirst({ where: { id, organizationId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot change the type of a cancelled order');
    }

    const sourceRequiresTable = await this.orderTypesService.requiresTable(organizationId, dto.source);

    if (sourceRequiresTable) {
      if (!dto.tableId) {
        throw new BadRequestException(`tableId is required when switching an order to ${dto.source}`);
      }
      const table = await this.prisma.restaurantTable.findFirst({
        where: { id: dto.tableId, organizationId, isActive: true },
      });
      if (!table) throw new NotFoundException('Table not found');
    }

    return this.prisma.$transaction(async (tx) => {
      if (order.tableId && order.tableId !== dto.tableId) {
        await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'AVAILABLE' } });
      }
      if (sourceRequiresTable && dto.tableId) {
        await tx.restaurantTable.update({ where: { id: dto.tableId }, data: { status: 'OCCUPIED' } });
      }

      return tx.order.update({
        where: { id },
        data: {
          source: dto.source,
          tableId: sourceRequiresTable ? dto.tableId : null,
        },
        include: this.orderInclude,
      });
    });
  }

  /**
   * Folds a second open order's items into this one (e.g. one guest is covering a table they
   * weren't originally on) so the merged bill goes through the normal single-order close/split
   * flow. Deliberately narrow for v1: both orders must still be open and unpaid — an order that
   * already has a payment recorded is left alone rather than trying to reconcile two payment
   * ledgers. The source order is cancelled, not deleted, for an audit trail; its own totals are
   * left as a historical snapshot rather than zeroed. Table occupancy is untouched — merging
   * bills says nothing about where the guests are actually sitting.
   */
  async mergeOrders(organizationId: string, destinationId: string, sourceOrderId: string) {
    if (destinationId === sourceOrderId) {
      throw new BadRequestException('Cannot merge an order into itself');
    }

    const [destination, source] = await Promise.all([
      this.prisma.order.findFirst({ where: { id: destinationId, organizationId } }),
      this.prisma.order.findFirst({ where: { id: sourceOrderId, organizationId } }),
    ]);
    if (!destination) throw new NotFoundException('Order not found');
    if (!source) throw new NotFoundException('Order to merge not found');

    if (!OPEN_STATUSES.includes(destination.status)) {
      throw new BadRequestException(`Cannot merge into a ${destination.status.toLowerCase()} order`);
    }
    if (!OPEN_STATUSES.includes(source.status)) {
      throw new BadRequestException(`Cannot merge a ${source.status.toLowerCase()} order`);
    }
    if (toNumber(destination.amountPaid) > 0) {
      throw new BadRequestException('This order already has a payment recorded — cannot merge into it');
    }
    if (toNumber(source.amountPaid) > 0) {
      throw new BadRequestException('That order already has a payment recorded — cannot merge it');
    }
    if (toNumber(destination.discountAmount) > 0 || toNumber(source.discountAmount) > 0) {
      throw new BadRequestException('An order with a discount applied cannot be merged — clear the discount first');
    }

    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const combinedSubtotal = toNumber(destination.subtotal) + toNumber(source.subtotal);
    // Merged bill inherits the destination order's charge settings — the two should normally
    // agree (same org), this is just the tie-break if they somehow don't.
    const { vatAmount, entertainmentTaxAmount, serviceChargeAmount, taxAmount } = this.computeOrderCharges(
      combinedSubtotal,
      organization,
      destination.vatApplied,
      destination.entertainmentTaxApplied,
      destination.serviceChargeApplied,
    );
    const total = combinedSubtotal + taxAmount + serviceChargeAmount;

    return this.prisma.$transaction(async (tx) => {
      // Conditional update guards against a concurrent close/cancel/merge racing past the checks
      // above — only a source still actually open gets folded in.
      const sourceResult = await tx.order.updateMany({
        where: { id: sourceOrderId, organizationId, status: { in: OPEN_STATUSES } },
        data: {
          status: 'CANCELLED',
          notes: source.notes
            ? `${source.notes} — merged into order ${destinationId}`
            : `Merged into order ${destinationId}`,
        },
      });
      if (sourceResult.count === 0) {
        throw new BadRequestException('That order is no longer available to merge');
      }

      await tx.orderItem.updateMany({
        where: { orderId: sourceOrderId },
        data: { orderId: destinationId },
      });

      const destResult = await tx.order.updateMany({
        where: { id: destinationId, organizationId, status: { in: OPEN_STATUSES } },
        data: { subtotal: combinedSubtotal, taxAmount, vatAmount, entertainmentTaxAmount, serviceChargeAmount, total },
      });
      if (destResult.count === 0) {
        throw new BadRequestException('This order is no longer available to merge into');
      }

      return tx.order.findUniqueOrThrow({ where: { id: destinationId }, include: this.orderInclude });
    });
  }

  /**
   * Peels specific items off this order onto a different one — an existing open order, or a
   * fresh one if `destinationOrderId` is omitted. This is what makes item-level bill splitting
   * possible without any new payment logic: once "the steak" and "the drink" are sitting on
   * separate orders, closing each one is just the ordinary single-order close/split flow. Same
   * payment/status guards as mergeOrders, applied to both ends since this is really a merge and
   * a split happening in the same transaction.
   */
  async moveItems(organizationId: string, sourceOrderId: string, dto: MoveOrderItemsDto) {
    if (dto.destinationOrderId === sourceOrderId) {
      throw new BadRequestException('Cannot move items to the same order');
    }

    const source = await this.prisma.order.findFirst({
      where: { id: sourceOrderId, organizationId },
      include: { items: true },
    });
    if (!source) throw new NotFoundException('Order not found');
    if (!OPEN_STATUSES.includes(source.status)) {
      throw new BadRequestException(`Cannot move items off a ${source.status.toLowerCase()} order`);
    }
    if (toNumber(source.amountPaid) > 0) {
      throw new BadRequestException('This order already has a payment recorded — cannot move items off it');
    }
    if (toNumber(source.discountAmount) > 0) {
      throw new BadRequestException('This order has a discount applied — clear it before moving items off it');
    }

    const requestedIds = dto.items.map((l) => l.itemId);
    if (new Set(requestedIds).size !== requestedIds.length) {
      throw new BadRequestException('Duplicate item in move request');
    }
    const itemsById = new Map(source.items.map((i) => [i.id, i]));

    // For each requested line, decide whether it's a full move (whole item changes orderId,
    // keeping its id/status/notes intact) or a partial split (source line's quantity/amount
    // shrinks, and a new item — same status, so nothing needs re-cooking — is created on the
    // destination for the moved units).
    const fullMoveIds: string[] = [];
    const splits: Array<{ item: (typeof source.items)[number]; moveQty: number; moveAmount: number }> = [];
    for (const line of dto.items) {
      const item = itemsById.get(line.itemId);
      if (!item) throw new NotFoundException('One or more items were not found on this order');
      const fullQty = toNumber(item.quantity);
      const moveQty = line.quantity ?? fullQty;
      if (moveQty <= 0) throw new BadRequestException(`Quantity to move for "${item.itemName}" must be greater than zero`);
      if (moveQty > fullQty + 1e-9) {
        throw new BadRequestException(`Cannot move ${moveQty} of "${item.itemName}" — only ${fullQty} available`);
      }
      if (moveQty >= fullQty - 1e-9) {
        fullMoveIds.push(item.id);
      } else {
        splits.push({ item, moveQty, moveAmount: Math.round(toNumber(item.unitPrice) * moveQty * 100) / 100 });
      }
    }

    const remainingItems = source.items.filter((i) => !fullMoveIds.includes(i.id));
    const movingSubtotal =
      fullMoveIds.reduce((sum, id) => sum + toNumber(itemsById.get(id)!.amount), 0) +
      splits.reduce((sum, s) => sum + s.moveAmount, 0);

    let destination = dto.destinationOrderId
      ? await this.prisma.order.findFirst({ where: { id: dto.destinationOrderId, organizationId } })
      : null;
    if (dto.destinationOrderId && !destination) {
      throw new NotFoundException('Destination order not found');
    }
    if (destination && !OPEN_STATUSES.includes(destination.status)) {
      throw new BadRequestException(`Cannot move items onto a ${destination.status.toLowerCase()} order`);
    }
    if (destination && toNumber(destination.amountPaid) > 0) {
      throw new BadRequestException('That order already has a payment recorded — cannot move items onto it');
    }
    if (destination && toNumber(destination.discountAmount) > 0) {
      throw new BadRequestException('That order has a discount applied — clear it before moving items onto it');
    }

    // Creating a fresh destination — defaults to the same table/type as the source, since the
    // common case is splitting one table's tab into two checks, not relocating items elsewhere.
    const newOrderSource = destination ? undefined : dto.source ?? source.source;
    const newOrderTableId = destination ? undefined : dto.tableId ?? source.tableId ?? undefined;
    if (!destination) {
      const newSourceRequiresTable = await this.orderTypesService.requiresTable(organizationId, newOrderSource!);
      if (newSourceRequiresTable && !newOrderTableId) {
        throw new BadRequestException(`tableId is required for a new ${newOrderSource} order`);
      }
    }
    if (!destination && newOrderTableId) {
      const table = await this.prisma.restaurantTable.findFirst({
        where: { id: newOrderTableId, organizationId, isActive: true },
      });
      if (!table) throw new NotFoundException('Table not found');
    }

    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

    // Source keeps its own charge settings — it isn't going anywhere, it's just lighter.
    const remainingSubtotal = remainingItems.reduce((sum, i) => sum + toNumber(i.amount), 0);
    const sourceTax = this.computeOrderCharges(
      remainingSubtotal,
      organization,
      source.vatApplied,
      source.entertainmentTaxApplied,
      source.serviceChargeApplied,
    );

    // Existing destination inherits its own settings (mirrors mergeOrders); a brand-new one gets
    // the org's current defaults, same as any other new order.
    const destVatApplied = destination ? destination.vatApplied : organization.vatEnabled;
    const destEntertainmentApplied = destination ? destination.entertainmentTaxApplied : organization.entertainmentTaxEnabled;
    const destServiceChargeApplied = destination ? destination.serviceChargeApplied : organization.serviceChargeEnabled;
    const destBaseSubtotal = destination ? toNumber(destination.subtotal) : 0;
    const destSubtotal = destBaseSubtotal + movingSubtotal;
    const destTax = this.computeOrderCharges(destSubtotal, organization, destVatApplied, destEntertainmentApplied, destServiceChargeApplied);

    return this.prisma.$transaction(async (tx) => {
      if (!destination) {
        destination = await tx.order.create({
          data: {
            organizationId,
            tableId: newOrderTableId,
            createdById: source.createdById,
            waiterId: source.waiterId,
            customerId: source.customerId,
            source: newOrderSource!,
            subtotal: destSubtotal,
            taxAmount: destTax.taxAmount,
            vatApplied: destVatApplied,
            entertainmentTaxApplied: destEntertainmentApplied,
            serviceChargeApplied: destServiceChargeApplied,
            vatAmount: destTax.vatAmount,
            entertainmentTaxAmount: destTax.entertainmentTaxAmount,
            serviceChargeAmount: destTax.serviceChargeAmount,
            total: destSubtotal + destTax.taxAmount + destTax.serviceChargeAmount,
          },
        });
        if (newOrderTableId) {
          await tx.restaurantTable.update({ where: { id: newOrderTableId }, data: { status: 'OCCUPIED' } });
        }
      } else {
        const destResult = await tx.order.updateMany({
          where: { id: destination.id, organizationId, status: { in: OPEN_STATUSES } },
          data: {
            subtotal: destSubtotal,
            taxAmount: destTax.taxAmount,
            vatAmount: destTax.vatAmount,
            entertainmentTaxAmount: destTax.entertainmentTaxAmount,
            serviceChargeAmount: destTax.serviceChargeAmount,
            total: destSubtotal + destTax.taxAmount + destTax.serviceChargeAmount,
          },
        });
        if (destResult.count === 0) {
          throw new BadRequestException('Destination order is no longer available');
        }
      }

      if (fullMoveIds.length > 0) {
        await tx.orderItem.updateMany({
          where: { id: { in: fullMoveIds } },
          data: { orderId: destination.id },
        });
      }

      for (const split of splits) {
        await tx.orderItem.update({
          where: { id: split.item.id },
          data: {
            quantity: { decrement: split.moveQty },
            amount: { decrement: split.moveAmount },
          },
        });
        await tx.orderItem.create({
          data: {
            orderId: destination.id,
            menuItemId: split.item.menuItemId,
            itemName: split.item.itemName,
            quantity: split.moveQty,
            unitPrice: split.item.unitPrice,
            amount: split.moveAmount,
            notes: split.item.notes,
            status: split.item.status,
          },
        });
      }

      const sourceResult = await tx.order.updateMany({
        where: { id: sourceOrderId, organizationId, status: { in: OPEN_STATUSES } },
        data:
          remainingItems.length === 0
            ? { status: 'CANCELLED', notes: source.notes ? `${source.notes} — items moved to order ${destination.id}` : `Items moved to order ${destination.id}` }
            : {
                subtotal: remainingSubtotal,
                taxAmount: sourceTax.taxAmount,
                vatAmount: sourceTax.vatAmount,
                entertainmentTaxAmount: sourceTax.entertainmentTaxAmount,
                serviceChargeAmount: sourceTax.serviceChargeAmount,
                total: remainingSubtotal + sourceTax.taxAmount + sourceTax.serviceChargeAmount,
              },
      });
      if (sourceResult.count === 0) {
        throw new BadRequestException('This order is no longer available');
      }

      return tx.order.findUniqueOrThrow({ where: { id: destination.id }, include: this.orderInclude });
    });
  }

  async cancel(organizationId: string, id: string) {
    const order = await this.prisma.order.findFirst({ where: { id, organizationId } });
    if (!order) throw new NotFoundException('Order not found');
    if (!VOIDABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(`Cannot cancel a ${order.status.toLowerCase()} order`);
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      // Conditional update guards against a concurrent close/cancel racing past the check above —
      // only an order still in a voidable status actually transitions.
      const result = await tx.order.updateMany({
        where: { id, organizationId, status: { in: VOIDABLE_STATUSES } },
        data: { status: 'CANCELLED' },
      });
      if (result.count === 0) {
        throw new BadRequestException('Order was already closed or cancelled');
      }
      if (order.tableId) {
        await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'AVAILABLE' } });
      }

      return tx.order.findUniqueOrThrow({ where: { id }, include: this.orderInclude });
    });

    this.dispatchCancellationDocket(organizationId, cancelled, cancelled.items);

    return { message: 'Order cancelled successfully' };
  }

  /**
   * A waiter (or above) marks an order done and ready for a cashier to collect payment on —
   * splits "close" from "accept payment" for POS-only orgs that use the cashier role. No
   * Payment row and no inventory deduction yet; the table stays occupied until payment lands.
   */
  async markAwaitingPayment(organizationId: string, id: string) {
    const order = await this.prisma.order.findFirst({ where: { id, organizationId } });
    if (!order) throw new NotFoundException('Order not found');
    if (!OPEN_STATUSES.includes(order.status)) {
      throw new BadRequestException(`Cannot mark a ${order.status.toLowerCase()} order as awaiting payment`);
    }

    const result = await this.prisma.order.updateMany({
      where: { id, organizationId, status: { in: OPEN_STATUSES } },
      data: { status: 'CLOSED_UNPAID', closedAt: new Date() },
    });
    if (result.count === 0) {
      throw new BadRequestException('Order was already closed or cancelled');
    }

    return this.prisma.order.findUniqueOrThrow({ where: { id }, include: this.orderInclude });
  }

  /**
   * Applies (or clears, at value 0) a discount at payment time — a manager comping a table, a
   * loyalty knock-off, etc. Deliberately separate from closeWithPayment: this shrinks the order's
   * own total before any payment math runs, so the existing partial/split-payment logic (which
   * only ever reads `total - amountPaid`) needs no changes at all. Pre-tax, mirroring the Invoice
   * discount pattern: subtotal - discountAmount, then tax/service charge computed on the
   * remainder. Role-restricted at the controller; reason and applier are required here regardless,
   * since a till-side discount with no record of who or why is a fraud vector.
   */
  async applyDiscount(organizationId: string, id: string, userId: string, dto: ApplyDiscountDto) {
    const order = await this.prisma.order.findFirst({ where: { id, organizationId } });
    if (!order) throw new NotFoundException('Order not found');
    if (!PAYABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(`Cannot discount a ${order.status.toLowerCase()} order`);
    }
    if (toNumber(order.amountPaid) > 0) {
      throw new BadRequestException('This order already has a payment recorded — cannot change its discount');
    }

    const subtotal = toNumber(order.subtotal);
    if (dto.discountType === 'PERCENTAGE' && dto.value > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100%');
    }
    if (dto.discountType === 'FIXED' && dto.value > subtotal) {
      throw new BadRequestException('Discount cannot exceed the order subtotal');
    }

    const discountPercent = dto.discountType === 'PERCENTAGE' ? dto.value : 0;
    const discountAmount =
      dto.discountType === 'FIXED' ? dto.value : Math.round(subtotal * (dto.value / 100) * 100) / 100;
    const afterDiscount = subtotal - discountAmount;

    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const { vatAmount, entertainmentTaxAmount, serviceChargeAmount, taxAmount } = this.computeOrderCharges(
      afterDiscount,
      organization,
      order.vatApplied,
      order.entertainmentTaxApplied,
      order.serviceChargeApplied,
    );

    return this.prisma.order.update({
      where: { id },
      data: {
        discountType: dto.discountType,
        discountPercent,
        discountAmount,
        discountReason: dto.reason,
        discountAppliedById: userId,
        taxAmount,
        vatAmount,
        entertainmentTaxAmount,
        serviceChargeAmount,
        total: afterDiscount + taxAmount + serviceChargeAmount,
      },
      include: this.orderInclude,
    });
  }

  /**
   * Records a payment against an order — evenly-split and custom-amount bill splitting both come
   * down to this being called more than once per order with a partial `amount`, each a separate
   * tender (possibly a different payment method/payer). No split-specific state is persisted;
   * the client decides what each partial amount should be (total/N, or whatever a cashier types
   * in) and this just tracks the running `amountPaid` until it meets the total. Item-level splits
   * (assigning specific items to a payer) are a separate, bigger feature — not handled here.
   *
   * Paystack checkout is a separate async flow — see OrdersController, which delegates to
   * PaystackService directly and reconciles via webhook, the same pattern invoices use.
   */
  async closeWithPayment(
    organizationId: string,
    id: string,
    userId: string,
    dto: CloseOrderDto,
  ) {
    if (dto.paymentMethod === 'PAYSTACK') {
      throw new BadRequestException('Use the Paystack checkout endpoint to close an order with PAYSTACK');
    }
    if (!dto.clientRequestId) {
      throw new BadRequestException('clientRequestId is required to close an order');
    }
    const clientRequestId = dto.clientRequestId;

    const order = await this.prisma.order.findFirst({ where: { id, organizationId } });
    if (!order) throw new NotFoundException('Order not found');
    if (!PAYABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(`Cannot close a ${order.status.toLowerCase()} order`);
    }
    if (dto.paymentMethod === 'WALLET' && !order.customerId) {
      throw new BadRequestException('A customer must be attached to the order to pay from their wallet');
    }
    if (!(await this.paymentTypesService.exists(organizationId, dto.paymentMethod))) {
      throw new BadRequestException(`"${dto.paymentMethod}" is not a valid payment method for this organization`);
    }

    const remaining = Math.round((toNumber(order.total) - toNumber(order.amountPaid)) * 100) / 100;
    if (remaining <= 0) {
      throw new BadRequestException('Order is already fully paid');
    }
    const amount = dto.amount ?? remaining;
    // Tiny epsilon guards against float/decimal rounding (e.g. three-way splits of an odd total)
    // flagging a final payment as "over" by a fraction of a kobo.
    if (amount > remaining + 0.01) {
      throw new BadRequestException(`Amount exceeds the remaining balance of ${remaining}`);
    }
    const isFinalPayment = amount >= remaining - 0.01;
    const newAmountPaid = Math.round((toNumber(order.amountPaid) + amount) * 100) / 100;

    return runIdempotent(this.prisma, organizationId, 'ORDER_CLOSE', clientRequestId, async (tx) => {
      // Conditional update guards against a concurrent close/cancel racing past the check above —
      // only an order still in a payable status actually transitions, so double-submits (e.g. a
      // cashier double-tapping "pay") can't create two Payment rows for the same tender. A partial
      // payment moves the order into CLOSED_UNPAID (still voidable, still payable) so it surfaces
      // in the cashier's queue with a running balance even if a waiter never explicitly marked it
      // ready; only the payment that actually finishes covering the total closes it out.
      const result = await tx.order.updateMany({
        where: { id, organizationId, status: { in: PAYABLE_STATUSES } },
        data: isFinalPayment
          ? { amountPaid: newAmountPaid, status: 'CLOSED_PAID', closedAt: new Date() }
          : { amountPaid: newAmountPaid, status: 'CLOSED_UNPAID' },
      });
      if (result.count === 0) {
        throw new BadRequestException('Order was already closed or cancelled');
      }

      const payment = await tx.payment.create({
        data: {
          organizationId,
          orderId: id,
          recordedById: userId,
          amount,
          paymentMethod: dto.paymentMethod,
          paymentDate: new Date(),
          reference: dto.reference,
          notes: dto.notes,
        },
      });

      if (dto.paymentMethod === 'WALLET') {
        // order.customerId presence was validated before entering runIdempotent.
        await this.walletService.debit(tx, organizationId, order.customerId as string, userId, {
          amount,
          type: 'ORDER_DEBIT',
          orderId: id,
          paymentId: payment.id,
        });
      }

      const updated = await tx.order.findUniqueOrThrow({
        where: { id },
        include: this.orderInclude,
      });

      // Everything below only happens once, on whichever payment actually finishes the order —
      // inventory must not be deducted twice, and a table shouldn't flip to "needs cleaning"
      // after split payment #1 of #3.
      if (isFinalPayment) {
        const placedAt = updated.createdAt;
        const servedAt = updated.closedAt as Date;
        for (const item of updated.items) {
          const categoryName = item.menuItem?.categories[0]?.category.name;
          await this.sheetSync.enqueue(tx, organizationId, 'ORDER_ITEMS', [
            formatSheetDate(servedAt),
            formatSheetMonth(servedAt),
            formatSheetTime(placedAt),
            formatSheetTime(servedAt),
            updated.id.slice(0, 8),
            updated.customer?.name ?? '',
            item.itemName,
            toNumber(item.quantity),
            categoryName ?? '',
            resolveSalesArea1(categoryName),
            updated.source,
            toNumber(updated.total),
            toNumber(item.amount),
            toNumber(updated.vatAmount),
            toNumber(updated.entertainmentTaxAmount),
            toNumber(updated.serviceChargeAmount),
            '',
            dto.paymentMethod,
          ]);
        }

        await this.inventoryService.deductForOrder(tx, id, organizationId);

        if (order.tableId) {
          await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'NEEDS_CLEANING' } });
        }
      }

      return updated;
    });
  }

  async getReceiptData(organizationId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, organizationId },
      include: {
        ...this.orderInclude,
        organization: {
          select: {
            name: true,
            email: true,
            phone: true,
            address: true,
            currency: true,
            taxRate: true,
            entertainmentTaxRate: true,
            serviceChargeRate: true,
            receiptBankName: true,
            receiptBankAccountNumber: true,
            receiptBankAccountName: true,
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    return {
      receiptNumber: `ORD-${order.id.slice(0, 5).toUpperCase()}`,
      createdAt: order.createdAt,
      closedAt: order.closedAt,
      source: order.source,
      table: order.table,
      customer: order.customer ? { name: order.customer.name, phone: order.customer.phone } : null,
      // Falls back to whoever placed the order when no waiter was assigned, so the receipt always
      // shows a name for "who to ask" rather than going blank.
      waiter: order.waiter
        ? { firstName: order.waiter.firstName, lastName: order.waiter.lastName }
        : order.createdBy
          ? { firstName: order.createdBy.firstName, lastName: order.createdBy.lastName }
          : null,
      items: order.items.map((i) => ({
        name: i.menuItem?.name ?? i.itemName,
        quantity: toNumber(i.quantity),
        unitPrice: toNumber(i.unitPrice),
        amount: toNumber(i.amount),
        notes: i.notes,
      })),
      subtotal: toNumber(order.subtotal),
      taxAmount: toNumber(order.taxAmount),
      total: toNumber(order.total),
      amountPaid: toNumber(order.amountPaid),
      discountType: order.discountType,
      discountPercent: toNumber(order.discountPercent),
      discountAmount: toNumber(order.discountAmount),
      // Rate + base breakdown (e.g. "VAT 7.5% on ₦21,600.00") rather than one lumped tax line —
      // each only shown by the client when its applied flag is true.
      vatApplied: order.vatApplied,
      vatRate: toNumber(order.organization.taxRate),
      vatAmount: toNumber(order.vatAmount),
      entertainmentTaxApplied: order.entertainmentTaxApplied,
      entertainmentTaxRate: toNumber(order.organization.entertainmentTaxRate),
      entertainmentTaxAmount: toNumber(order.entertainmentTaxAmount),
      serviceChargeApplied: order.serviceChargeApplied,
      serviceChargeRate: toNumber(order.organization.serviceChargeRate),
      serviceChargeAmount: toNumber(order.serviceChargeAmount),
      payments: order.payments.map((p) => ({
        amount: toNumber(p.amount),
        paymentMethod: p.paymentMethod,
        paymentDate: p.paymentDate,
      })),
      organization: order.organization,
    };
  }
}
