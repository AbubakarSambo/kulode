import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto, UpdateClientDto, ClientFilterDto } from './dto';
import { paginate } from '../../common';

/** The business ticked the consent box on the customer's behalf; the customer did not opt in themselves. */
export const OPT_IN_SOURCE_BUSINESS = 'business_attested';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, filter: ClientFilterDto) {
    const { page = 1, limit = 20, search, status } = filter;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status === 'active') {
      where.isActive = true;
    } else if (status === 'inactive') {
      where.isActive = false;
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
          clientType: true,
          createdAt: true,
          _count: {
            select: { invoices: { where: { deletedAt: null } } },
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
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            total: true,
            amountPaid: true,
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
        // Server-stamped consent time and source, not trusting client-supplied values
        ...(dto.whatsappOptIn ? { whatsappOptInAt: new Date(), whatsappOptInSource: OPT_IN_SOURCE_BUSINESS } : {}),
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

    // A customer who replied STOP stays opted out. Ticking the box again must not quietly override that
    // (the reminders would stay blocked anyway), so their consent can't be changed from here.
    const optedOutByCustomer = !!client.whatsappOptedOutAt;
    const { whatsappOptIn, ...rest } = dto;
    const turningOn = whatsappOptIn === true && !client.whatsappOptIn && !optedOutByCustomer;

    const updated = await this.prisma.client.update({
      where: { id },
      data: {
        ...rest,
        ...(!optedOutByCustomer && whatsappOptIn !== undefined ? { whatsappOptIn } : {}),
        // Stamp consent time and source only on the false -> true transition
        ...(turningOn ? { whatsappOptInAt: new Date(), whatsappOptInSource: OPT_IN_SOURCE_BUSINESS } : {}),
      },
    });

    return updated;
  }

  async remove(id: string, organizationId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId },
      include: {
        invoices: {
          select: { id: true, deletedAt: true },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const activeInvoices = client.invoices.filter((inv) => !inv.deletedAt);

    // If client has active (non-deleted) invoices, soft delete by deactivating
    if (activeInvoices.length > 0) {
      await this.prisma.client.update({
        where: { id },
        data: { isActive: false },
      });
      return { message: 'Client deactivated (has associated invoices)' };
    }

    // All invoices are soft-deleted (or none exist) — hard delete everything in a transaction
    const softDeletedInvoiceIds = client.invoices.map((inv) => inv.id);

    await this.prisma.$transaction(async (tx) => {
      if (softDeletedInvoiceIds.length > 0) {
        // Delete payments first (no cascade from invoice)
        await tx.payment.deleteMany({
          where: { invoiceId: { in: softDeletedInvoiceIds } },
        });
        // Delete invoices (items and installments cascade automatically)
        await tx.invoice.deleteMany({
          where: { id: { in: softDeletedInvoiceIds } },
        });
      }
      await tx.client.delete({ where: { id } });
    });

    return { message: 'Client deleted successfully' };
  }
}
