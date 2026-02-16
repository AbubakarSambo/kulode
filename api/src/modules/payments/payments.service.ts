import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto, UpdatePaymentDto, PaymentFilterDto } from './dto';
import { paginate } from '../../common';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, filter: PaymentFilterDto) {
    const { page = 1, limit = 20, paymentMethod, invoiceId, startDate, endDate } = filter;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = { organizationId };

    if (paymentMethod) {
      where.paymentMethod = paymentMethod;
    }

    if (invoiceId) {
      where.invoiceId = invoiceId;
    }

    if (startDate || endDate) {
      where.paymentDate = {};
      if (startDate) {
        where.paymentDate.gte = startDate;
      }
      if (endDate) {
        where.paymentDate.lte = endDate;
      }
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          invoice: {
            select: { id: true, invoiceNumber: true, total: true },
          },
          recordedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return paginate(payments, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, organizationId },
      include: {
        invoice: {
          include: {
            client: {
              select: { id: true, name: true },
            },
          },
        },
        recordedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async createForInvoice(
    invoiceId: string,
    organizationId: string,
    userId: string,
    dto: CreatePaymentDto,
  ) {
    // Verify invoice exists and belongs to organization
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId, deletedAt: null },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException('Cannot add payment to cancelled invoice');
    }

    if (invoice.status === 'DRAFT') {
      throw new BadRequestException('Cannot add payment to draft invoice');
    }

    // Check if payment amount exceeds remaining balance
    const remainingBalance = Number(invoice.total) - Number(invoice.amountPaid);
    if (dto.amount > remainingBalance) {
      throw new BadRequestException(
        `Payment amount exceeds remaining balance of ${remainingBalance}`,
      );
    }

    // Create payment and update invoice in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          organizationId,
          invoiceId,
          recordedById: userId,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod,
          paymentDate: dto.paymentDate,
          reference: dto.reference,
          notes: dto.notes,
        },
        include: {
          invoice: {
            select: { id: true, invoiceNumber: true },
          },
        },
      });

      // Update invoice amount paid and status
      const newAmountPaid = Number(invoice.amountPaid) + dto.amount;
      const newStatus = newAmountPaid >= Number(invoice.total) ? 'PAID' : 'PARTIALLY_PAID';

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          amountPaid: newAmountPaid,
          status: newStatus,
          // Clear payment link so a new one can be generated for next installment
          paymentUrl: null,
          paystackReference: null,
          paystackAccessCode: null,
        },
      });

      return payment;
    });

    return result;
  }

  async update(id: string, organizationId: string, dto: UpdatePaymentDto) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, organizationId },
      include: { invoice: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // If amount is changing, update invoice transactionally
    if (dto.amount !== undefined && dto.amount !== Number(payment.amount)) {
      const oldAmount = Number(payment.amount);
      const newAmount = dto.amount;
      const invoice = payment.invoice;

      // Calculate remaining balance: what the invoice can still accept
      const remainingBalance =
        Number(invoice.total) - Number(invoice.amountPaid) + oldAmount;

      if (newAmount > remainingBalance) {
        throw new BadRequestException(
          `Payment amount exceeds remaining balance of ${remainingBalance}`,
        );
      }

      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.payment.update({
          where: { id },
          data: {
            ...dto,
            paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
          },
          include: {
            invoice: {
              select: { id: true, invoiceNumber: true },
            },
          },
        });

        const newAmountPaid =
          Number(invoice.amountPaid) - oldAmount + newAmount;
        let newStatus = invoice.status;

        if (newAmountPaid >= Number(invoice.total)) {
          newStatus = 'PAID';
        } else if (newAmountPaid > 0) {
          newStatus = 'PARTIALLY_PAID';
        } else {
          newStatus = 'SENT';
        }

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            amountPaid: Math.max(0, newAmountPaid),
            status: newStatus,
          },
        });

        return updated;
      });
    }

    // No amount change — simple update
    return this.prisma.payment.update({
      where: { id },
      data: {
        ...dto,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
      },
      include: {
        invoice: {
          select: { id: true, invoiceNumber: true },
        },
      },
    });
  }

  async remove(id: string, organizationId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, organizationId },
      include: { invoice: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Update invoice and delete payment in transaction
    await this.prisma.$transaction(async (tx) => {
      // Update invoice amount paid
      const newAmountPaid = Number(payment.invoice.amountPaid) - Number(payment.amount);
      let newStatus = payment.invoice.status;

      if (newAmountPaid <= 0) {
        newStatus = 'SENT';
      } else if (newAmountPaid < Number(payment.invoice.total)) {
        newStatus = 'PARTIALLY_PAID';
      }

      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          amountPaid: Math.max(0, newAmountPaid),
          status: newStatus,
        },
      });

      await tx.payment.delete({ where: { id } });
    });

    return { message: 'Payment deleted successfully' };
  }

  async getReceiptData(id: string, organizationId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, organizationId },
      include: {
        invoice: {
          include: {
            client: {
              select: {
                name: true,
                email: true,
                phone: true,
                address: true,
              },
            },
          },
        },
        organization: {
          select: {
            name: true,
            email: true,
            phone: true,
            address: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return {
      receiptNumber: `RCP-${payment.id.slice(0, 8).toUpperCase()}`,
      paymentDate: payment.paymentDate,
      amount: Number(payment.amount),
      paymentMethod: payment.paymentMethod,
      reference: payment.reference,
      notes: payment.notes,
      invoice: {
        invoiceNumber: payment.invoice.invoiceNumber,
        total: Number(payment.invoice.total),
      },
      client: {
        name: payment.invoice.client.name,
        email: payment.invoice.client.email,
        phone: payment.invoice.client.phone,
        address: payment.invoice.client.address,
      },
      organization: {
        name: payment.organization.name,
        email: payment.organization.email,
        phone: payment.organization.phone,
        address: payment.organization.address,
      },
    };
  }
}
