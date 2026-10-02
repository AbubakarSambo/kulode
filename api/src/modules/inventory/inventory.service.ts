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
      sellPrice: item.sellPrice != null ? toNumber(item.sellPrice) : null,
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

  // Used by the retail checkout scan flow — looked up on every barcode scan, so it stays a single
  // indexed lookup (organizationId+barcode is unique) rather than a fuzzy/partial search.
  async findByBarcode(organizationId: string, barcode: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { organizationId, barcode, isActive: true },
    });
    if (!item) throw new NotFoundException('No item found for this barcode');
    return this.addAvailable(item);
  }

  async create(organizationId: string, userId: string, dto: CreateInventoryItemDto) {
    const existing = await this.prisma.inventoryItem.findUnique({
      where: { organizationId_name: { organizationId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException('An inventory item with this name already exists');
    }

    if (dto.barcode) {
      const existingBarcode = await this.prisma.inventoryItem.findUnique({
        where: { organizationId_barcode: { organizationId, barcode: dto.barcode } },
      });
      if (existingBarcode) {
        throw new ConflictException('An inventory item with this barcode already exists');
      }
    }

    const item = await this.prisma.$transaction(async (tx) => {
      const newItem = await tx.inventoryItem.create({
        data: {
          organizationId,
          name: dto.name,
          description: dto.description,
          unitPrice: dto.unitPrice,
          reorderLevel: dto.reorderLevel ?? 0,
          unitOfMeasure: dto.unitOfMeasure,
          sku: dto.sku,
          onHandQuantity: dto.initialStock ?? 0,
          barcode: dto.barcode,
          sellPrice: dto.sellPrice,
          department: dto.department,
          vatCategory: dto.vatCategory,
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

  // Loads a retail catalog from a CSV (name,barcode,sellPrice,unitPrice,department,unitOfMeasure,
  // reorderLevel,initialStock,sku — header required, unknown columns ignored). A supermarket's
  // catalog runs to hundreds/thousands of SKUs, so this replaces hand-creating items one at a time.
  // Each row is created independently (not one all-or-nothing transaction) so one bad row — a
  // duplicate barcode, a missing name — doesn't block every other row in the file from loading;
  // the caller gets a per-row success/error report back instead.
  async bulkImport(organizationId: string, userId: string, csv: string) {
    const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      throw new BadRequestException('CSV must have a header row and at least one data row');
    }

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name.toLowerCase());
    const nameIdx = col('name');
    if (nameIdx === -1) {
      throw new BadRequestException('CSV header must include a "name" column');
    }

    const results: Array<{ row: number; name?: string; status: 'created' | 'error'; error?: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map((c) => c.trim());
      const get = (name: string) => {
        const idx = col(name);
        return idx === -1 ? undefined : cells[idx] || undefined;
      };

      const name = get('name');
      if (!name) {
        results.push({ row: i + 1, status: 'error', error: 'Missing name' });
        continue;
      }

      try {
        const unitPriceRaw = get('unitprice') ?? get('sellprice') ?? '0';
        await this.create(organizationId, userId, {
          name,
          barcode: get('barcode'),
          sellPrice: get('sellprice') ? Number(get('sellprice')) : undefined,
          unitPrice: Number(unitPriceRaw),
          department: get('department'),
          unitOfMeasure: get('unitofmeasure') as any,
          reorderLevel: get('reorderlevel') ? Number(get('reorderlevel')) : undefined,
          initialStock: get('initialstock') ? Number(get('initialstock')) : undefined,
          sku: get('sku'),
        });
        results.push({ row: i + 1, name, status: 'created' });
      } catch (err) {
        results.push({ row: i + 1, name, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    return {
      total: results.length,
      created: results.filter((r) => r.status === 'created').length,
      failed: results.filter((r) => r.status === 'error').length,
      results,
    };
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

    if (dto.barcode && dto.barcode !== item.barcode) {
      const existingBarcode = await this.prisma.inventoryItem.findUnique({
        where: { organizationId_barcode: { organizationId, barcode: dto.barcode } },
      });
      if (existingBarcode) {
        throw new ConflictException('An inventory item with this barcode already exists');
      }
    }

    const updated = await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.unitPrice !== undefined && { unitPrice: dto.unitPrice }),
        ...(dto.reorderLevel !== undefined && { reorderLevel: dto.reorderLevel }),
        ...(dto.unitOfMeasure !== undefined && { unitOfMeasure: dto.unitOfMeasure }),
        ...(dto.sku !== undefined && { sku: dto.sku }),
        ...(dto.barcode !== undefined && { barcode: dto.barcode }),
        ...(dto.sellPrice !== undefined && { sellPrice: dto.sellPrice }),
        ...(dto.department !== undefined && { department: dto.department }),
        ...(dto.vatCategory !== undefined && { vatCategory: dto.vatCategory }),
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
      include: { menuItem: { select: { inventoryItemId: true, ingredients: { select: { id: true } } } } },
    });

    // Resolves the InventoryItem to deduct for one order item: a direct retail sale
    // (inventoryItemId set, no menuItem at all) or a legacy whole-unit MenuItem link —
    // never both, and never a recipe item (those are deducted per-line on SERVED, see below).
    const resolveInventoryItemId = (orderItem: (typeof orderItems)[number]) => {
      if (orderItem.inventoryItemId) return orderItem.inventoryItemId;
      if (orderItem.menuItem?.ingredients.length) return undefined;
      return orderItem.menuItem?.inventoryItemId ?? undefined;
    };

    const inventoryItemIds = Array.from(
      new Set(
        orderItems
          .map((orderItem) => resolveInventoryItemId(orderItem))
          .filter((id): id is string => !!id),
      ),
    );
    if (inventoryItemIds.length === 0) return;

    // One batched read instead of a `findFirst` per order item. Kept as a mutable running
    // tally (rather than re-reading) because two order items can share the same inventory
    // item — each deduction must see the previous one's result to keep onHandBefore/After
    // accurate in the stock-movement audit trail.
    const inventoryItems = await tx.inventoryItem.findMany({
      where: { id: { in: inventoryItemIds }, organizationId },
    });
    const onHandById = new Map(inventoryItems.map((item) => [item.id, toNumber(item.onHandQuantity)]));

    const movements: Prisma.StockMovementCreateManyInput[] = [];
    for (const orderItem of orderItems) {
      const inventoryItemId = resolveInventoryItemId(orderItem);
      if (!inventoryItemId || !onHandById.has(inventoryItemId)) continue;

      const deductQty = toNumber(orderItem.quantity);
      const currentOnHand = onHandById.get(inventoryItemId)!;
      const newOnHand = currentOnHand - deductQty;
      onHandById.set(inventoryItemId, newOnHand);

      await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: { onHandQuantity: newOnHand },
      });

      movements.push({
        organizationId,
        inventoryItemId,
        orderId,
        type: 'ORDER_DEDUCTED',
        quantity: -deductQty,
        onHandBefore: currentOnHand,
        onHandAfter: newOnHand,
      });
    }

    if (movements.length > 0) {
      await tx.stockMovement.createMany({ data: movements });
    }
  }

  // Called once per order item, the first time it transitions to SERVED (see
  // OrdersService.updateItemStatus) — walks that item's recipe and decrements each ingredient's
  // on-hand stock. Deliberately clamps at zero rather than throwing: a missing ingredient should
  // surface as a stock discrepancy to reconcile later, not block a cashier from marking food served.
  // No-ops for menu items without recipe lines (they're covered by the legacy deductForOrder path).
  async deductRecipeForOrderItem(
    tx: TransactionClient,
    organizationId: string,
    orderId: string,
    menuItemId: string,
    quantitySold: number,
  ) {
    const recipe = await tx.menuItemIngredient.findMany({ where: { menuItemId } });
    if (recipe.length === 0) return;

    // One batched read instead of a `findUnique` per ingredient. Safe to update every line in
    // parallel below (unlike deductForOrder's running tally above) since a recipe can't repeat
    // the same ingredient twice — @@unique([menuItemId, inventoryItemId]) guarantees each line
    // here touches a distinct inventory item, so there's no shared running total to serialize on.
    const inventoryItemIds = recipe.map((line) => line.inventoryItemId);
    const inventoryItems = await tx.inventoryItem.findMany({ where: { id: { in: inventoryItemIds } } });
    const byId = new Map(inventoryItems.map((item) => [item.id, item]));

    const movements = (
      await Promise.all(
        recipe.map(async (line) => {
          const inventoryItem = byId.get(line.inventoryItemId);
          if (!inventoryItem) return null;

          const onHandBefore = toNumber(inventoryItem.onHandQuantity);
          const deductQty = toNumber(line.quantityPerUnit) * quantitySold;
          const onHandAfter = Math.max(0, onHandBefore - deductQty);

          await tx.inventoryItem.update({
            where: { id: line.inventoryItemId },
            data: { onHandQuantity: onHandAfter },
          });

          const movement: Prisma.StockMovementCreateManyInput = {
            organizationId,
            inventoryItemId: line.inventoryItemId,
            orderId,
            type: 'ORDER_DEDUCTED',
            quantity: onHandAfter - onHandBefore,
            onHandBefore,
            onHandAfter,
          };
          return movement;
        }),
      )
    ).filter((m): m is Prisma.StockMovementCreateManyInput => m !== null);

    if (movements.length > 0) {
      await tx.stockMovement.createMany({ data: movements });
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
