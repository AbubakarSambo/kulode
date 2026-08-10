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
  UpdateOrderCustomerDto,
  UpdateOrderWaiterDto,
  CloseOrderDto,
  OrderFilterDto,
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
    waiter: { select: { id: true, name: true, phone: true } },
    createdBy: { select: { id: true, firstName: true, lastName: true } },
    items: {
      include: { menuItem: { select: { id: true, name: true } } },
    },
    payments: true,
  } as const;

  async findAll(organizationId: string, filter: OrderFilterDto) {
    const { page = 1, limit = 20, status, tableId, customerId, waiterId } = filter;
    const skip = (page - 1) * limit;
    const where = {
      organizationId,
      ...(status && { status }),
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
      const waiter = await this.prisma.waiter.findFirst({
        where: { id: dto.waiterId, organizationId, isActive: true },
      });
      if (!waiter) throw new NotFoundException('Waiter not found');
    }

    const pricedItems = await this.priceItems(organizationId, dto.items);
    const subtotal = pricedItems.reduce((sum, i) => sum + i.amount, 0);

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    const taxRate = organization.vatEnabled ? toNumber(organization.taxRate) : 0;
    const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
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
    const taxRate = organization.vatEnabled ? toNumber(organization.taxRate) : 0;

    const newSubtotal = toNumber(order.subtotal) + addedAmount;
    const newTaxAmount = Math.round(newSubtotal * (taxRate / 100) * 100) / 100;
    const newTotal = newSubtotal + newTaxAmount;

    return runIdempotent(this.prisma, organizationId, 'ORDER_ADD_ITEMS', dto.clientRequestId, async (tx) => {
      await tx.orderItem.createMany({
        data: pricedItems.map((i) => ({ ...i, orderId: id })),
      });

      return tx.order.update({
        where: { id },
        data: { subtotal: newSubtotal, taxAmount: newTaxAmount, total: newTotal },
        include: this.orderInclude,
      });
    });
  }

  async updateItemStatus(
    organizationId: string,
    orderId: string,
    itemId: string,
    dto: UpdateOrderItemStatusDto,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, organizationId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const item = order.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Order item not found');

    await this.prisma.orderItem.update({ where: { id: itemId }, data: { status: dto.status } });

    // Roll the order-level status up from its items so front-of-house and kitchen views agree.
    const items = await this.prisma.orderItem.findMany({ where: { orderId } });
    let newOrderStatus: 'IN_KITCHEN' | 'READY' | undefined;
    if (items.every((i) => i.status === 'READY' || i.status === 'SERVED')) {
      newOrderStatus = 'READY';
    } else if (items.some((i) => i.status === 'PREPARING' || i.status === 'READY' || i.status === 'SERVED')) {
      newOrderStatus = 'IN_KITCHEN';
    }

    if (newOrderStatus && OPEN_STATUSES.includes(order.status)) {
      await this.prisma.order.update({ where: { id: orderId }, data: { status: newOrderStatus } });
    }

    return this.findOne(organizationId, orderId);
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
      const waiter = await this.prisma.waiter.findFirst({
        where: { id: dto.waiterId, organizationId, isActive: true },
      });
      if (!waiter) throw new NotFoundException('Waiter not found');
    }

    return this.prisma.order.update({
      where: { id },
      data: { waiterId: dto.waiterId ?? null },
      include: this.orderInclude,
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
   * Closes an order against an immediate (non-Paystack) payment method. Paystack checkout is a
   * separate async flow — see OrdersController, which delegates to PaystackService directly and
   * reconciles via webhook, the same pattern invoices use.
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

    const amount = dto.amount ?? toNumber(order.total);
    // v0 requires full settlement at close time; partial/split payments are a v1 feature.
    if (amount < toNumber(order.total)) {
      throw new BadRequestException('Partial payments are not yet supported — amount must cover the full order total');
    }

    return runIdempotent(this.prisma, organizationId, 'ORDER_CLOSE', clientRequestId, async (tx) => {
      // Conditional update guards against a concurrent close/cancel racing past the check above —
      // only an order still in an open status actually transitions, so double-submits (e.g. a
      // cashier double-tapping "close") can't create two Payment rows for the same order.
      const result = await tx.order.updateMany({
        where: { id, organizationId, status: { in: PAYABLE_STATUSES } },
        data: { amountPaid: amount, status: 'CLOSED_PAID', closedAt: new Date() },
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

      await this.inventoryService.deductForOrder(tx, id, organizationId);

      if (order.tableId) {
        await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'NEEDS_CLEANING' } });
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
        name: i.menuItem.name,
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
