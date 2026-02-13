import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto, UpdateClientDto } from './dto';
import { PaginationDto, paginate } from '../../common';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, pagination: PaginationDto, search?: string) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          isActive: true,
          createdAt: true,
          _count: {
            select: { invoices: true },
          },
        },
      }),
      this.prisma.client.count({ where }),
    ]);

    return paginate(clients, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId },
      include: {
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            total: true,
            issueDate: true,
            dueDate: true,
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }

  async create(organizationId: string, dto: CreateClientDto) {
    const client = await this.prisma.client.create({
      data: {
        organizationId,
        ...dto,
      },
    });

    return client;
  }

  async update(id: string, organizationId: string, dto: UpdateClientDto) {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const updated = await this.prisma.client.update({
      where: { id },
      data: dto,
    });

    return updated;
  }

  async remove(id: string, organizationId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId },
      include: { invoices: { take: 1 } },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    // If client has invoices, soft delete by deactivating
    if (client.invoices.length > 0) {
      await this.prisma.client.update({
        where: { id },
        data: { isActive: false },
      });
      return { message: 'Client deactivated (has associated invoices)' };
    }

    // Otherwise, hard delete
    await this.prisma.client.delete({ where: { id } });
    return { message: 'Client deleted successfully' };
  }
}
