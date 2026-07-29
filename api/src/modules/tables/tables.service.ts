import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableDto, UpdateTableDto, UpdateTableStatusDto } from './dto';

@Injectable()
export class TablesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.restaurantTable.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const table = await this.prisma.restaurantTable.findFirst({ where: { id, organizationId } });
    if (!table) throw new NotFoundException('Table not found');
    return table;
  }

  async create(organizationId: string, dto: CreateTableDto) {
    const existing = await this.prisma.restaurantTable.findUnique({
      where: { organizationId_name: { organizationId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException('A table with this name already exists');
    }

    return this.prisma.restaurantTable.create({
      data: {
        organizationId,
        name: dto.name,
        section: dto.section,
        capacity: dto.capacity ?? 2,
      },
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

    return this.prisma.restaurantTable.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.section !== undefined && { section: dto.section }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
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
