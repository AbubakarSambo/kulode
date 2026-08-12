import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryItemDto, UpdateInventoryItemDto, AdjustStockDto } from './dto';

type TransactionClient = Prisma.TransactionClient;

function toNumber(val: Prisma.Decimal | number): number {
  return typeof val === 'number' ? val : Number(val);
}

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  private addAvailable(item: any) {
    return {
      ...item,
      onHandQuantity: toNumber(item.onHandQuantity),
      reservedQuantity: toNumber(item.reservedQuantity),
      reorderLevel: toNumber(item.reorderLevel),
      unitPrice: toNumber(item.unitPrice),
      availableQuantity: toNumber(item.onHandQuantity) - toNumber(item.reservedQuantity),
    };
  }

  async findAll(organizationId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: 'asc' },
    });
    return items.map((item) => this.addAvailable(item));
  }

  async findOne(id: string, organizationId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, organizationId, isActive: true },
    });
    if (!item) throw new NotFoundException('Inventory item not found');
    return this.addAvailable(item);
  }

  async create(organizationId: string, userId: string, dto: CreateInventoryItemDto) {
    const existing = await this.prisma.inventoryItem.findUnique({
      where: { organizationId_name: { organizationId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException('An inventory item with this name already exists');
    }

    const item = await this.prisma.$transaction(async (tx) => {
      const newItem = await tx.inventoryItem.create({
        data: {
          organizationId,
          name: dto.name,
          description: dto.description,
          unitPrice: dto.unitPrice,
          reorderLevel: dto.reorderLevel ?? 0,
          sku: dto.sku,
          onHandQuantity: dto.initialStock ?? 0,
        },
      });

      if (dto.initialStock && dto.initialStock > 0) {
        await tx.stockMovement.create({
          data: {
            organizationId,
            inventoryItemId: newItem.id,
            type: 'RESTOCK',
            quantity: dto.initialStock,
            onHandBefore: 0,
            onHandAfter: dto.initialStock,
            notes: 'Initial stock',
            createdById: userId,
          },
        });
      }

      return newItem;
    });

    return this.addAvailable(item);
  }

  async update(organizationId: string, id: string, dto: UpdateInventoryItemDto) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, organizationId, isActive: true },
    });
    if (!item) throw new NotFoundException('Inventory item not found');

    if (dto.name && dto.name !== item.name) {
      const existing = await this.prisma.inventoryItem.findUnique({
        where: { organizationId_name: { organizationId, name: dto.name } },
      });
      if (existing) {
        throw new ConflictException('An inventory item with this name already exists');
      }
    }

    const updated = await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.unitPrice !== undefined && { unitPrice: dto.unitPrice }),
        ...(dto.reorderLevel !== undefined && { reorderLevel: dto.reorderLevel }),
        ...(dto.sku !== undefined && { sku: dto.sku }),
      },
    });

    return this.addAvailable(updated);
  }

  async remove(organizationId: string, id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, organizationId, isActive: true },
    });
    if (!item) throw new NotFoundException('Inventory item not found');

    if (toNumber(item.reservedQuantity) > 0) {
      throw new BadRequestException(
        'Cannot delete an inventory item with active reservations. Cancel the related invoices first.',
      );
    }

    await this.prisma.inventoryItem.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Inventory item deleted successfully' };
  }

  async adjustStock(organizationId: string, id: string, userId: string, dto: AdjustStockDto) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, organizationId, isActive: true },
    });
    if (!item) throw new NotFoundException('Inventory item not found');

    const currentOnHand = toNumber(item.onHandQuantity);
    // RESTOCK adds stock; ADJUSTMENT (write-off) removes stock
    const movementQty = dto.type === 'RESTOCK' ? dto.quantity : -dto.quantity;
    const newOnHand = currentOnHand + movementQty;

    if (newOnHand < 0) {
      throw new BadRequestException(
        `Cannot reduce stock below 0. Current stock: ${currentOnHand}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id },
        data: { onHandQuantity: newOnHand },
      });

      await tx.stockMovement.create({
        data: {
          organizationId,
          inventoryItemId: id,
          type: dto.type,
          quantity: movementQty,
          onHandBefore: currentOnHand,
          onHandAfter: newOnHand,
          notes: dto.notes,
          createdById: userId,
        },
      });
    });

    return { message: 'Stock adjusted successfully' };
  }

  async getMovements(organizationId: string, id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, organizationId },
    });
    if (!item) throw new NotFoundException('Inventory item not found');

    return this.prisma.stockMovement.findMany({
      where: { inventoryItemId: id, organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ─── Transaction-aware stock methods ──────────────────────────────────────

  async reserveForInvoice(
    tx: TransactionClient,
    invoiceId: string,
    organizationId: string,
    items: Array<{ inventoryItemId: string; quantity: number }>,
  ) {
    for (const item of items) {
      const inventoryItem = await tx.inventoryItem.findFirst({
        where: { id: item.inventoryItemId, organizationId },
      });
      if (!inventoryItem) continue;

      const currentOnHand = toNumber(inventoryItem.onHandQuantity);
      const currentReserved = toNumber(inventoryItem.reservedQuantity);
      const newReserved = currentReserved + item.quantity;

      await tx.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: { reservedQuantity: newReserved },
      });

      await tx.stockMovement.create({
        data: {
          organizationId,
          inventoryItemId: item.inventoryItemId,
          invoiceId,
          type: 'INVOICE_RESERVED',
          quantity: item.quantity,
          onHandBefore: currentOnHand,
          onHandAfter: currentOnHand,
        },
      });
    }
  }

  async releaseReservation(
    tx: TransactionClient,
    invoiceId: string,
    organizationId: string,
  ) {
    const invoiceItems = await tx.invoiceItem.findMany({
      where: { invoiceId, inventoryItemId: { not: null } },
    });

    for (const invoiceItem of invoiceItems) {
      if (!invoiceItem.inventoryItemId) continue;

      const inventoryItem = await tx.inventoryItem.findFirst({
        where: { id: invoiceItem.inventoryItemId, organizationId },
      });
      if (!inventoryItem) continue;

      const currentOnHand = toNumber(inventoryItem.onHandQuantity);
      const currentReserved = toNumber(inventoryItem.reservedQuantity);
      const releaseQty = toNumber(invoiceItem.quantity);
      const newReserved = Math.max(0, currentReserved - releaseQty);

      await tx.inventoryItem.update({
        where: { id: invoiceItem.inventoryItemId },
        data: { reservedQuantity: newReserved },
      });

      await tx.stockMovement.create({
        data: {
          organizationId,
          inventoryItemId: invoiceItem.inventoryItemId,
          invoiceId,
          type: 'RESERVATION_RELEASED',
          quantity: releaseQty,
          onHandBefore: currentOnHand,
          onHandAfter: currentOnHand,
        },
      });
    }
  }

  async deductOnPayment(
    tx: TransactionClient,
    invoiceId: string,
    organizationId: string,
  ) {
    const invoiceItems = await tx.invoiceItem.findMany({
      where: { invoiceId, inventoryItemId: { not: null } },
    });

    for (const invoiceItem of invoiceItems) {
      if (!invoiceItem.inventoryItemId) continue;

      const inventoryItem = await tx.inventoryItem.findFirst({
        where: { id: invoiceItem.inventoryItemId, organizationId },
      });
      if (!inventoryItem) continue;

      const deductQty = toNumber(invoiceItem.quantity);
      const currentOnHand = toNumber(inventoryItem.onHandQuantity);
      const currentReserved = toNumber(inventoryItem.reservedQuantity);
      const newOnHand = currentOnHand - deductQty;
      const newReserved = Math.max(0, currentReserved - deductQty);

      await tx.inventoryItem.update({
        where: { id: invoiceItem.inventoryItemId },
        data: {
          onHandQuantity: newOnHand,
          reservedQuantity: newReserved,
        },
      });

      await tx.stockMovement.create({
        data: {
          organizationId,
          inventoryItemId: invoiceItem.inventoryItemId,
          invoiceId,
          type: 'INVOICE_DEDUCTED',
          quantity: -deductQty,
          onHandBefore: currentOnHand,
          onHandAfter: newOnHand,
        },
      });
    }
  }

  async deductForOrder(
    tx: TransactionClient,
    orderId: string,
    organizationId: string,
  ) {
    const orderItems = await tx.orderItem.findMany({
      where: { orderId },
      include: { menuItem: { select: { inventoryItemId: true } } },
    });

    for (const orderItem of orderItems) {
      const inventoryItemId = orderItem.menuItem?.inventoryItemId;
      if (!inventoryItemId) continue;

      const inventoryItem = await tx.inventoryItem.findFirst({
        where: { id: inventoryItemId, organizationId },
      });
      if (!inventoryItem) continue;

      const deductQty = toNumber(orderItem.quantity);
      const currentOnHand = toNumber(inventoryItem.onHandQuantity);
      const newOnHand = currentOnHand - deductQty;

      await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: { onHandQuantity: newOnHand },
      });

      await tx.stockMovement.create({
        data: {
          organizationId,
          inventoryItemId,
          orderId,
          type: 'ORDER_DEDUCTED',
          quantity: -deductQty,
          onHandBefore: currentOnHand,
          onHandAfter: newOnHand,
        },
      });
    }
  }

  async reversePaymentDeduction(
    tx: TransactionClient,
    invoiceId: string,
    organizationId: string,
  ) {
    const invoiceItems = await tx.invoiceItem.findMany({
      where: { invoiceId, inventoryItemId: { not: null } },
    });

    for (const invoiceItem of invoiceItems) {
      if (!invoiceItem.inventoryItemId) continue;

      const inventoryItem = await tx.inventoryItem.findFirst({
        where: { id: invoiceItem.inventoryItemId, organizationId },
      });
      if (!inventoryItem) continue;

      const qty = toNumber(invoiceItem.quantity);
      const currentOnHand = toNumber(inventoryItem.onHandQuantity);
      const currentReserved = toNumber(inventoryItem.reservedQuantity);

      await tx.inventoryItem.update({
        where: { id: invoiceItem.inventoryItemId },
        data: {
          onHandQuantity: currentOnHand + qty,
          reservedQuantity: currentReserved + qty,
        },
      });

      await tx.stockMovement.create({
        data: {
          organizationId,
          inventoryItemId: invoiceItem.inventoryItemId,
          invoiceId,
          type: 'INVOICE_RESERVED',
          quantity: qty,
          onHandBefore: currentOnHand,
          onHandAfter: currentOnHand + qty,
          notes: 'Payment reversal - re-reserved',
        },
      });
    }
  }
}
