import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWaiterDto, UpdateWaiterDto } from './dto';

@Injectable()
export class WaitersService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.waiter.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async create(organizationId: string, dto: CreateWaiterDto) {
    const existing = await this.prisma.waiter.findUnique({
      where: { organizationId_name: { organizationId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException('A waiter with this name already exists');
    }

    return this.prisma.waiter.create({
      data: {
        organizationId,
        name: dto.name,
        phone: dto.phone,
        notes: dto.notes,
      },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateWaiterDto) {
    const waiter = await this.prisma.waiter.findFirst({ where: { id, organizationId } });
    if (!waiter) throw new NotFoundException('Waiter not found');

    if (dto.name && dto.name !== waiter.name) {
      const existing = await this.prisma.waiter.findUnique({
        where: { organizationId_name: { organizationId, name: dto.name } },
      });
      if (existing) {
        throw new ConflictException('A waiter with this name already exists');
      }
    }

    return this.prisma.waiter.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(organizationId: string, id: string) {
    const waiter = await this.prisma.waiter.findFirst({ where: { id, organizationId } });
    if (!waiter) throw new NotFoundException('Waiter not found');

    await this.prisma.waiter.delete({ where: { id } });
    return { message: 'Waiter deleted successfully' };
  }
}
