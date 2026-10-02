import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderTypeDto, UpdateOrderTypeDto } from './dto';

@Injectable()
export class OrderTypesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    const existing = await this.prisma.orderType.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (existing.length > 0) return existing;

    // Lazily seed the default types the first time an org (new, or newly POS-enabled) asks
    // for its order types — covers every path that can flip an org onto POS without needing to
    // hook every place enabledModules/posMode gets written.
    return this.seedDefaults(organizationId);
  }

  private async seedDefaults(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { posMode: true },
    });

    // A distinct name per posMode (not reusing "Takeaway" for a retail sale) matters beyond just
    // labeling — Order.source is grouped raw across every org in platform-wide reporting
    // (PlatformService's order-source breakdown), so two unrelated businesses' sales landing
    // under the same string would conflate a restaurant's real takeaway orders with a
    // supermarket's checkout sales in any cross-org aggregate.
    const defaults =
      org?.posMode === 'RETAIL'
        ? [{ name: 'Retail Sale', sortOrder: 0, requiresTable: false }]
        : [
            { name: 'Dine In', sortOrder: 0, requiresTable: true },
            { name: 'Takeaway', sortOrder: 1, requiresTable: false },
            { name: 'Delivery', sortOrder: 2, requiresTable: false },
            { name: 'Third Party', sortOrder: 3, requiresTable: false },
          ];

    await this.prisma.orderType.createMany({
      data: defaults.map((d) => ({ organizationId, ...d })),
      skipDuplicates: true,
    });
    return this.prisma.orderType.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // Case-insensitive dedupe guard — "Hotel Room Service" and "hotel room service" would
  // otherwise silently fragment reporting/sheet-sync grouping into two separate buckets.
  private async assertNameAvailable(organizationId: string, name: string, excludeId?: string) {
    const existing = await this.prisma.orderType.findFirst({
      where: {
        organizationId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
    if (existing) {
      throw new ConflictException('An order type with this name already exists');
    }
  }

  async create(organizationId: string, dto: CreateOrderTypeDto) {
    const name = dto.name.trim();
    await this.assertNameAvailable(organizationId, name);

    return this.prisma.orderType.create({
      data: {
        organizationId,
        name,
        sortOrder: dto.sortOrder ?? 0,
        requiresTable: dto.requiresTable ?? false,
      },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateOrderTypeDto) {
    const orderType = await this.prisma.orderType.findFirst({ where: { id, organizationId } });
    if (!orderType) throw new NotFoundException('Order type not found');

    const name = dto.name?.trim();
    if (name && name.toLowerCase() !== orderType.name.toLowerCase()) {
      await this.assertNameAvailable(organizationId, name, id);
    }

    return this.prisma.orderType.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.requiresTable !== undefined && { requiresTable: dto.requiresTable }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(organizationId: string, id: string) {
    const orderType = await this.prisma.orderType.findFirst({ where: { id, organizationId } });
    if (!orderType) throw new NotFoundException('Order type not found');

    await this.prisma.orderType.update({ where: { id }, data: { isActive: false } });
    return { message: 'Order type deleted successfully' };
  }

  /**
   * Looks up whether an order placed under this type name requires a table — the single real
   * behavior branch order type drives (used by OrdersService in place of the old hardcoded
   * `source === 'DINE_IN'` check). Throws if the name isn't a valid active type for the org, which
   * replaces the DTO-level `@IsIn(ORDER_SOURCES)` static enum check that used to guard this.
   */
  async requiresTable(organizationId: string, name: string): Promise<boolean> {
    // Goes through findAll (lazy-seeds the 4 defaults on first use) rather than a raw lookup —
    // a brand-new org that's never opened the Order Types settings page or placed a table-
    // requiring order (the other two paths that happen to trigger seeding) would otherwise have
    // an empty order_types table and fail this check on a perfectly valid default name.
    const types = await this.findAll(organizationId);
    const orderType = types.find((t) => t.name === name);
    if (!orderType) {
      throw new BadRequestException(`"${name}" is not a valid order type for this organization`);
    }
    return orderType.requiresTable;
  }

  /**
   * Resolves the type to use when a caller omits an explicit order type (e.g. tapping a table on
   * the floor plan, which implies "whichever type this org uses for table service" rather than a
   * literal, hardcoded "Dine In" — that literal would throw in requiresTable() above the moment an
   * org renames its table-requiring type, since it'd no longer match any active OrderType by name.
   */
  async getDefaultTableType(organizationId: string) {
    const types = await this.findAll(organizationId);
    const tableType = types.find((t) => t.requiresTable);
    if (!tableType) {
      throw new BadRequestException('No active order type is configured to require a table');
    }
    return tableType;
  }
}
