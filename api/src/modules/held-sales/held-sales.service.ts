import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HoldSaleDto } from './dto';

interface StoredLine {
  inventoryItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

// A parked cart is a same-day thing. Anything older is a cart the customer walked out on, so it
// is swept (marked EXPIRED, not deleted) the next time anyone opens the held list.
const HELD_SALE_TTL_HOURS = 16;

// Stops a runaway client (or a cashier who never recalls) from filling the list forever.
const MAX_HELD_PER_ORG = 50;

@Injectable()
export class HeldSalesService {
  constructor(private prisma: PrismaService) {}

  /** Every cart currently parked in the org — visible from every till. */
  async findAll(organizationId: string) {
    await this.expireStale(organizationId);

    const rows = await this.prisma.heldSale.findMany({
      where: { organizationId, status: 'HELD' },
      orderBy: { createdAt: 'asc' },
      include: { heldBy: { select: { firstName: true, lastName: true } } },
    });

    return rows.map((row) => {
      const lines = row.items as unknown as StoredLine[];
      return {
        id: row.id,
        label: row.label,
        createdAt: row.createdAt,
        heldByName: `${row.heldBy.firstName} ${row.heldBy.lastName}`.trim(),
        // First few product names — how a cashier recognises a returning customer's cart in the list.
        preview: lines.slice(0, 3).map((l) => l.name),
        itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
        total: lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0),
      };
    });
  }

  async hold(organizationId: string, userId: string, dto: HoldSaleDto) {
    // Merge duplicate lines so one product never appears twice in the stored cart.
    const quantities = new Map<string, number>();
    for (const line of dto.items) {
      quantities.set(line.inventoryItemId, (quantities.get(line.inventoryItemId) ?? 0) + line.quantity);
    }

    const heldCount = await this.prisma.heldSale.count({ where: { organizationId, status: 'HELD' } });
    if (heldCount >= MAX_HELD_PER_ORG) {
      throw new BadRequestException(
        `There are already ${MAX_HELD_PER_ORG} held sales — recall or discard some before holding another`,
      );
    }

    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: [...quantities.keys()] }, organizationId },
      select: { id: true, name: true, sellPrice: true },
    });
    if (items.length !== quantities.size) {
      throw new BadRequestException('One or more items in this cart no longer exist');
    }

    const lines: StoredLine[] = items.map((item) => ({
      inventoryItemId: item.id,
      name: item.name,
      quantity: quantities.get(item.id)!,
      unitPrice: item.sellPrice ? Number(item.sellPrice) : 0,
    }));

    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, organizationId },
        select: { id: true },
      });
      if (!customer) throw new BadRequestException('Customer not found');
    }

    const created = await this.prisma.heldSale.create({
      data: {
        organizationId,
        heldById: userId,
        label: dto.label?.trim() || null,
        items: lines as unknown as Prisma.InputJsonValue,
        customerId: dto.customerId ?? null,
      },
    });
    return { id: created.id };
  }

  /**
   * Picks a held cart back up. The HELD -> RECALLED flip is a single conditional update, so when two
   * cashiers tap the same sale at once exactly one wins and the other gets a clear message rather
   * than the same cart ringing up at two tills.
   *
   * The lines come back priced from the CURRENT catalogue (the checkout re-prices on the server
   * anyway), flagged where the price moved since the hold or the item is no longer sellable, so
   * nothing surprises the customer at payment.
   */
  async recall(organizationId: string, userId: string, id: string) {
    const claimed = await this.prisma.heldSale.updateMany({
      where: { id, organizationId, status: 'HELD' },
      data: { status: 'RECALLED', recalledById: userId, settledAt: new Date() },
    });
    if (claimed.count === 0) {
      const existing = await this.prisma.heldSale.findFirst({ where: { id, organizationId } });
      if (!existing) throw new NotFoundException('Held sale not found');
      throw new ConflictException('This sale has already been picked up at another till');
    }

    const row = await this.prisma.heldSale.findUniqueOrThrow({ where: { id } });
    const stored = row.items as unknown as StoredLine[];

    const current = await this.prisma.inventoryItem.findMany({
      where: { id: { in: stored.map((l) => l.inventoryItemId) }, organizationId },
      select: { id: true, name: true, sellPrice: true, isActive: true },
    });
    const byId = new Map(current.map((c) => [c.id, c]));

    const lines = stored.map((line) => {
      const now = byId.get(line.inventoryItemId);
      const currentPrice = now?.sellPrice != null ? Number(now.sellPrice) : null;
      const unavailable = !now || !now.isActive || currentPrice == null;
      return {
        inventoryItemId: line.inventoryItemId,
        name: now?.name ?? line.name,
        quantity: line.quantity,
        unitPrice: currentPrice ?? line.unitPrice,
        heldUnitPrice: line.unitPrice,
        priceChanged: !unavailable && currentPrice !== line.unitPrice,
        unavailable,
      };
    });

    return { id: row.id, label: row.label, customerId: row.customerId, lines };
  }

  /** Throws a held cart away (customer left, wrong cart). Kept as a DISCARDED row for the audit trail. */
  async discard(organizationId: string, id: string) {
    const result = await this.prisma.heldSale.updateMany({
      where: { id, organizationId, status: 'HELD' },
      data: { status: 'DISCARDED', settledAt: new Date() },
    });
    if (result.count === 0) {
      const existing = await this.prisma.heldSale.findFirst({ where: { id, organizationId } });
      if (!existing) throw new NotFoundException('Held sale not found');
      throw new ConflictException('This sale has already been picked up or discarded');
    }
    return { id };
  }

  private async expireStale(organizationId: string) {
    const cutoff = new Date(Date.now() - HELD_SALE_TTL_HOURS * 60 * 60 * 1000);
    await this.prisma.heldSale.updateMany({
      where: { organizationId, status: 'HELD', createdAt: { lt: cutoff } },
      data: { status: 'EXPIRED', settledAt: new Date() },
    });
  }
}
