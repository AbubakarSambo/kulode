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

    // Lazily seed the 4 default types the first time an org (new, or newly POS-enabled) asks
    // for its order types — covers every path that can flip an org onto POS without needing to
    // hook every place enabledModules gets written.
    return this.seedDefaults(organizationId);
  }

  private async seedDefaults(organizationId: string) {
    const defaults = [
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
    const orderType = await this.prisma.orderType.findFirst({
      where: { organizationId, name, isActive: true },
    });
    if (!orderType) {
      throw new BadRequestException(`"${name}" is not a valid order type for this organization`);
    }
    return orderType.requiresTable;
  }
}
