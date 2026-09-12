import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableDto, UpdateTableDto, UpdateTableStatusDto, BulkAssignOrderTypeDto } from './dto';

const tableInclude = { orderType: { select: { id: true, name: true } } };

@Injectable()
export class TablesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.restaurantTable.findMany({
      where: { organizationId, isActive: true },
      include: tableInclude,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(organizationId: string, id: string) {
    const table = await this.prisma.restaurantTable.findFirst({
      where: { id, organizationId },
      include: tableInclude,
    });
    if (!table) throw new NotFoundException('Table not found');
    return table;
  }

  /** Throws if orderTypeId is set but doesn't belong to (or isn't active in) this org. */
  private async assertOrderType(organizationId: string, orderTypeId: string | null | undefined) {
    if (!orderTypeId) return;
    const orderType = await this.prisma.orderType.findFirst({
      where: { id: orderTypeId, organizationId, isActive: true },
    });
    if (!orderType) throw new NotFoundException('Order type not found');
  }

  async create(organizationId: string, dto: CreateTableDto) {
    const existing = await this.prisma.restaurantTable.findUnique({
      where: { organizationId_name: { organizationId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException('A table with this name already exists');
    }
    await this.assertOrderType(organizationId, dto.orderTypeId);

    return this.prisma.restaurantTable.create({
      data: {
        organizationId,
        name: dto.name,
        section: dto.section,
        capacity: dto.capacity ?? 2,
        sortOrder: dto.sortOrder ?? 0,
        orderTypeId: dto.orderTypeId,
      },
      include: tableInclude,
    });
  }

  async update(organizationId: string, id: string, dto: UpdateTableDto) {
    const table = await this.prisma.restaurantTable.findFirst({ where: { id, organizationId } });
    if (!table) throw new NotFoundException('Table not found');

    if (dto.name && dto.name !== table.name) {
      const existing = await this.prisma.restaurantTable.findUnique({
        where: { organizationId_name: { organizationId, name: dto.name } },
      });
      if (existing) {
        throw new ConflictException('A table with this name already exists');
      }
    }
    if (dto.orderTypeId !== undefined) {
      await this.assertOrderType(organizationId, dto.orderTypeId);
    }

    return this.prisma.restaurantTable.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.section !== undefined && { section: dto.section }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.orderTypeId !== undefined && { orderTypeId: dto.orderTypeId }),
      },
      include: tableInclude,
    });
  }

  /** Assigns (or clears, with orderTypeId null) one order type across many tables at once —
   * the "set order type for this whole section" action, so an admin doesn't have to edit tables
   * one by one. */
  async bulkAssignOrderType(organizationId: string, dto: BulkAssignOrderTypeDto) {
    await this.assertOrderType(organizationId, dto.orderTypeId);

    const result = await this.prisma.restaurantTable.updateMany({
      where: { id: { in: dto.tableIds }, organizationId },
      data: { orderTypeId: dto.orderTypeId ?? null },
    });
    if (result.count === 0) {
      throw new NotFoundException('No matching tables found');
    }
    return this.findAll(organizationId);
  }

  async updateStatus(organizationId: string, id: string, dto: UpdateTableStatusDto) {
    const table = await this.prisma.restaurantTable.findFirst({ where: { id, organizationId } });
    if (!table) throw new NotFoundException('Table not found');

    return this.prisma.restaurantTable.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  async remove(organizationId: string, id: string) {
    const table = await this.prisma.restaurantTable.findFirst({ where: { id, organizationId } });
    if (!table) throw new NotFoundException('Table not found');

    const openOrder = await this.prisma.order.findFirst({
      where: { tableId: id, status: { in: ['OPEN', 'IN_KITCHEN', 'READY'] } },
    });
    if (openOrder) {
      throw new BadRequestException('Cannot delete a table with an open order');
    }

    await this.prisma.restaurantTable.update({ where: { id }, data: { isActive: false } });
    return { message: 'Table deleted successfully' };
  }
}
