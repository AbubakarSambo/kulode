import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { WalletService } from '../wallet/wallet.service';
import { SheetSyncService } from '../sheet-sync';
import {
  CreateOrderDto,
  AddOrderItemsDto,
  UpdateOrderItemStatusDto,
  UpdateOrderItemDto,
  UpdateOrderCustomerDto,
  UpdateOrderWaiterDto,
  UpdateOrderSourceDto,
  CloseOrderDto,
  OrderFilterDto,
  MoveOrderItemsDto,
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

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private walletService: WalletService,
    private sheetSync: SheetSyncService,
  ) {}

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
      include: { menuItem: { select: { id: true, name: true, durationMinutes: true } } },
    },
    payments: true,
  } as const;

  async findAll(organizationId: string, filter: OrderFilterDto) {
    const { page = 1, limit = 20, status, statuses, tableId, customerId, waiterId } = filter;
    const skip = (page - 1) * limit;
    const where = {
      organizationId,
      ...(statuses && statuses.length > 0 ? { status: { in: statuses } } : status && { status }),
      ...(tableId && { tableId }),
      ...(customerId && { customerId }),
      ...(waiterId && { waiterId }),
    };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.orderInclude,
      }),
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
    const source = dto.source ?? 'DINE_IN';

    if (source === 'DINE_IN' && !dto.tableId) {
      throw new BadRequestException('tableId is required for dine-in orders');
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

    // Each tax type only applies at all if the org has it enabled; when enabled, it defaults to
    // "on" for a new order (matching the old always-on behavior) unless explicitly toggled off.
    const applyVat = organization.vatEnabled && (dto.applyVat ?? true);
    const applyEntertainmentTax = organization.entertainmentTaxEnabled && (dto.applyEntertainmentTax ?? true);
    const { vatAmount, entertainmentTaxAmount, taxAmount } = this.computeOrderTax(
      subtotal,
      organization,
      applyVat,
      applyEntertainmentTax,
    );
    const total = subtotal + taxAmount;

    return runIdempotent(this.prisma, organizationId, 'ORDER_CREATE', dto.clientRequestId, async (tx) => {
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
          vatAmount,
          entertainmentTaxAmount,
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
  }

  async addItems(organizationId: string, id: string, dto: AddOrderItemsDto) {
    const order = await this.prisma.order.findFirst({ where: { id, organizationId } });
    if (!order) throw new NotFoundException('Order not found');
    if (!OPEN_STATUSES.includes(order.status)) {
      throw new BadRequestException(`Cannot add items to a ${order.status.toLowerCase()} order`);
    }

    const pricedItems = await this.priceItems(organizationId, dto.items);
    const addedAmount = pricedItems.reduce((sum, i) => sum + i.amount, 0);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });

    const newSubtotal = toNumber(order.subtotal) + addedAmount;
    // Which taxes apply was already decided at order creation — adding items recalculates the
    // amounts against the org's current rates, but never silently turns a tax on/off mid-order.
    const { vatAmount, entertainmentTaxAmount, taxAmount: newTaxAmount } = this.computeOrderTax(
      newSubtotal,
      organization,
      order.vatApplied,
      order.entertainmentTaxApplied,
    );
    const newTotal = newSubtotal + newTaxAmount;

    return runIdempotent(this.prisma, organizationId, 'ORDER_ADD_ITEMS', dto.clientRequestId, async (tx) => {
      await tx.orderItem.createMany({
        data: pricedItems.map((i) => ({ ...i, orderId: id })),
      });

      return tx.order.update({
        where: { id },
        data: { subtotal: newSubtotal, taxAmount: newTaxAmount, vatAmount, entertainmentTaxAmount, total: newTotal },
        include: this.orderInclude,
      });
    });
  }

  private computeOrderTax(
    subtotal: number,
    organization: { taxRate: Prisma.Decimal | number; entertainmentTaxRate: Prisma.Decimal | number },
    applyVat: boolean,
    applyEntertainmentTax: boolean,
  ) {
    const vatRate = applyVat ? toNumber(organization.taxRate) : 0;
    const entertainmentRate = applyEntertainmentTax ? toNumber(organization.entertainmentTaxRate) : 0;
    const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100;
    const entertainmentTaxAmount = Math.round(subtotal * (entertainmentRate / 100) * 100) / 100;
    return { vatAmount, entertainmentTaxAmount, taxAmount: vatAmount + entertainmentTaxAmount };
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
    const { vatAmount, entertainmentTaxAmount, taxAmount } = this.computeOrderTax(
      newSubtotal,
      organization,
      order.vatApplied,
      order.entertainmentTaxApplied,
    );

    return this.prisma.$transaction(async (tx) => {
      if (dto.quantity === 0) {
        await tx.orderItem.delete({ where: { id: itemId } });
      } else {
        await tx.orderItem.update({ where: { id: itemId }, data: { quantity: dto.quantity, amount: newAmount } });
      }

      if (dto.quantity === 0 && remainingItems.length === 0) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'CANCELLED', notes: order.notes ? `${order.notes} — last item removed` : 'Last item removed' },
        });
      } else {
        await tx.order.update({
          where: { id: orderId },
          data: { subtotal: newSubtotal, taxAmount, vatAmount, entertainmentTaxAmount, total: newSubtotal + taxAmount },
        });
      }

      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: this.orderInclude });
    });
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

  /**
   * Reclassifies an order (e.g. a dine-in party decides to take it to go instead). Switching away
   * from DINE_IN frees whatever table it was on — the whole point of the change is that no one's
   * sitting there anymore. Switching to DINE_IN requires a table and occupies it, same as at
   * order creation.
   */
  async setSource(organizationId: string, id: string, dto: UpdateOrderSourceDto) {
    const order = await this.prisma.order.findFirst({ where: { id, organizationId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot change the type of a cancelled order');
    }

    if (dto.source === 'DINE_IN') {
      if (!dto.tableId) {
        throw new BadRequestException('tableId is required when switching an order to dine-in');
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
      if (dto.source === 'DINE_IN' && dto.tableId) {
        await tx.restaurantTable.update({ where: { id: dto.tableId }, data: { status: 'OCCUPIED' } });
      }

      return tx.order.update({
        where: { id },
        data: {
          source: dto.source,
          tableId: dto.source === 'DINE_IN' ? dto.tableId : null,
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

    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const combinedSubtotal = toNumber(destination.subtotal) + toNumber(source.subtotal);
    // Merged bill inherits the destination order's tax settings — the two should normally agree
    // (same org), this is just the tie-break if they somehow don't.
    const { vatAmount, entertainmentTaxAmount, taxAmount } = this.computeOrderTax(
      combinedSubtotal,
      organization,
      destination.vatApplied,
      destination.entertainmentTaxApplied,
    );
    const total = combinedSubtotal + taxAmount;

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
        data: { subtotal: combinedSubtotal, taxAmount, vatAmount, entertainmentTaxAmount, total },
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

    const movingItems = source.items.filter((i) => dto.itemIds.includes(i.id));
    if (movingItems.length !== dto.itemIds.length) {
      throw new NotFoundException('One or more items were not found on this order');
    }
    const remainingItems = source.items.filter((i) => !dto.itemIds.includes(i.id));
    const movingSubtotal = movingItems.reduce((sum, i) => sum + toNumber(i.amount), 0);

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

    // Creating a fresh destination — defaults to the same table/type as the source, since the
    // common case is splitting one table's tab into two checks, not relocating items elsewhere.
    const newOrderSource = destination ? undefined : dto.source ?? source.source;
    const newOrderTableId = destination ? undefined : dto.tableId ?? source.tableId ?? undefined;
    if (!destination && newOrderSource === 'DINE_IN' && !newOrderTableId) {
      throw new BadRequestException('tableId is required for a new dine-in order');
    }
    if (!destination && newOrderTableId) {
      const table = await this.prisma.restaurantTable.findFirst({
        where: { id: newOrderTableId, organizationId, isActive: true },
      });
      if (!table) throw new NotFoundException('Table not found');
    }

    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

    // Source keeps its own tax settings — it isn't going anywhere, it's just lighter.
    const remainingSubtotal = remainingItems.reduce((sum, i) => sum + toNumber(i.amount), 0);
    const sourceTax = this.computeOrderTax(remainingSubtotal, organization, source.vatApplied, source.entertainmentTaxApplied);

    // Existing destination inherits its own settings (mirrors mergeOrders); a brand-new one gets
    // the org's current defaults, same as any other new order.
    const destVatApplied = destination ? destination.vatApplied : organization.vatEnabled;
    const destEntertainmentApplied = destination ? destination.entertainmentTaxApplied : organization.entertainmentTaxEnabled;
    const destBaseSubtotal = destination ? toNumber(destination.subtotal) : 0;
    const destSubtotal = destBaseSubtotal + movingSubtotal;
    const destTax = this.computeOrderTax(destSubtotal, organization, destVatApplied, destEntertainmentApplied);

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
            vatAmount: destTax.vatAmount,
            entertainmentTaxAmount: destTax.entertainmentTaxAmount,
            total: destSubtotal + destTax.taxAmount,
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
            total: destSubtotal + destTax.taxAmount,
          },
        });
        if (destResult.count === 0) {
          throw new BadRequestException('Destination order is no longer available');
        }
      }

      await tx.orderItem.updateMany({
        where: { id: { in: dto.itemIds } },
        data: { orderId: destination.id },
      });

      const sourceResult = await tx.order.updateMany({
        where: { id: sourceOrderId, organizationId, status: { in: OPEN_STATUSES } },
        data:
          remainingItems.length === 0
            ? { status: 'CANCELLED', notes: source.notes ? `${source.notes} — items moved to order ${destination.id}` : `Items moved to order ${destination.id}` }
            : { subtotal: remainingSubtotal, taxAmount: sourceTax.taxAmount, vatAmount: sourceTax.vatAmount, entertainmentTaxAmount: sourceTax.entertainmentTaxAmount, total: remainingSubtotal + sourceTax.taxAmount },
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

    await this.prisma.$transaction(async (tx) => {
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
    });

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

      const recordedBy = await tx.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      await this.sheetSync.enqueue(tx, organizationId, 'PAYMENTS', [
        payment.id,
        updated.id,
        payment.paymentDate.toISOString(),
        toNumber(payment.amount),
        payment.paymentMethod,
        recordedBy ? `${recordedBy.firstName} ${recordedBy.lastName}` : '',
        payment.reference ?? '',
      ]);

      // Everything below only happens once, on whichever payment actually finishes the order —
      // inventory must not be deducted twice, and a table shouldn't flip to "needs cleaning"
      // after split payment #1 of #3.
      if (isFinalPayment) {
        await this.sheetSync.enqueue(tx, organizationId, 'ORDERS', [
          updated.id,
          (updated.closedAt as Date).toISOString(),
          updated.source,
          updated.table?.name ?? '',
          updated.customer?.name ?? '',
          toNumber(updated.subtotal),
          toNumber(updated.taxAmount),
          toNumber(updated.total),
          dto.paymentMethod,
        ]);

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
          select: { name: true, email: true, phone: true, address: true, currency: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    return {
      receiptNumber: `ORD-${order.id.slice(0, 8).toUpperCase()}`,
      createdAt: order.createdAt,
      closedAt: order.closedAt,
      source: order.source,
      table: order.table,
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
      payments: order.payments.map((p) => ({
        amount: toNumber(p.amount),
        paymentMethod: p.paymentMethod,
        paymentDate: p.paymentDate,
      })),
      organization: order.organization,
    };
  }
}
