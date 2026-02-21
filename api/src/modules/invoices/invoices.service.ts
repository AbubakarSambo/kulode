import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  InvoiceFilterDto,
  CreateServiceItemDto,
  UpdateServiceItemDto,
} from './dto';
import { paginate, PLAN_LIMITS } from '../../common';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, filter: InvoiceFilterDto) {
    const { page = 1, limit = 20, status, clientId, startDate, endDate } = filter;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {
      organizationId,
      deletedAt: null,
    };

    if (status) {
      where.status = status;
    }

    if (clientId) {
      where.clientId = clientId;
    }

    if (startDate || endDate) {
      where.issueDate = {};
      if (startDate) {
        where.issueDate.gte = startDate;
      }
      if (endDate) {
        where.issueDate.lte = endDate;
      }
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { issueDate: 'desc' },
        include: {
          client: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { payments: true },
          },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return paginate(invoices, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        client: true,
        items: {
          orderBy: { createdAt: 'asc' },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          include: {
            recordedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        installments: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  async findOneWithOrganization(id: string, organizationId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        organization: {
          select: {
            name: true,
            email: true,
            phone: true,
            address: true,
          },
        },
        client: {
          select: {
            name: true,
            email: true,
            phone: true,
            address: true,
          },
        },
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            description: true,
            quantity: true,
            unitPrice: true,
            amount: true,
          },
        },
        installments: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return {
      id: invoice.id,
      organizationId: invoice.organizationId,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      subtotal: Number(invoice.subtotal),
      discountType: invoice.discountType,
      discountPercent: Number(invoice.discountPercent),
      discountAmount: Number(invoice.discountAmount),
      taxRate: Number(invoice.taxRate),
      taxAmount: Number(invoice.taxAmount),
      total: Number(invoice.total),
      amountPaid: Number(invoice.amountPaid),
      notes: invoice.notes,
      terms: invoice.terms,
      paymentUrl: invoice.paymentUrl,
      organization: invoice.organization,
      client: invoice.client,
      items: invoice.items.map(item => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        amount: Number(item.amount),
      })),
      installments: invoice.installments.map(inst => ({
        id: inst.id,
        label: inst.label,
        sequence: inst.sequence,
        percentage: Number(inst.percentage),
        amount: Number(inst.amount),
        isPaid: inst.isPaid,
        paymentUrl: inst.paymentUrl,
      })),
    };
  }

  async create(organizationId: string, userId: string, dto: CreateInvoiceDto) {
    // Verify client belongs to organization
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, organizationId },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    // Get organization for invoice prefix, tax settings, and plan check
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        invoicePrefix: true, vatEnabled: true, taxRate: true, defaultNotes: true, paymentTerms: true,
        planTier: true, subscriptionStatus: true, trialEndDate: true, isGrandfathered: true,
      },
    });

    // Enforce invoice limit unless grandfathered
    if (organization && !organization.isGrandfathered) {
      let effectivePlan = organization.planTier;
      if (
        organization.subscriptionStatus === 'TRIALING' &&
        organization.trialEndDate &&
        new Date() > organization.trialEndDate
      ) {
        effectivePlan = 'FREE';
      }
      if (organization.subscriptionStatus === 'EXPIRED') {
        effectivePlan = 'FREE';
      }

      const limits = PLAN_LIMITS[effectivePlan];
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const invoiceCount = await this.prisma.invoice.count({
        where: {
          organizationId,
          deletedAt: null,
          createdAt: { gte: startOfMonth },
        },
      });

      if (invoiceCount >= limits.maxInvoicesPerMonth) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'INVOICE_LIMIT_REACHED',
          message: `Your ${effectivePlan} plan allows up to ${limits.maxInvoicesPerMonth} invoices per month. Please upgrade to create more.`,
          currentPlan: effectivePlan,
          limit: limits.maxInvoicesPerMonth,
          current: invoiceCount,
        });
      }
    }

    // Generate invoice number
    const invoiceNumber = await this.generateInvoiceNumber(organizationId, organization!.invoicePrefix);

    // Calculate totals
    const items = dto.items.map((item) => ({
      description: item.description || '',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.quantity * item.unitPrice,
    }));

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const discountType = dto.discountType || 'PERCENTAGE';
    const discountValue = dto.discountPercent || 0;
    const discountPercent = discountType === 'FIXED' ? 0 : discountValue;
    const discountAmount = discountType === 'FIXED'
      ? discountValue
      : subtotal * (discountValue / 100);
    const afterDiscount = subtotal - discountAmount;
    const orgTaxRate = organization!.vatEnabled ? Number(organization!.taxRate) : 0;
    const taxAmount = orgTaxRate > 0 ? afterDiscount * (orgTaxRate / 100) : 0;
    const total = afterDiscount + taxAmount;

    // Validate installments if provided
    if (dto.installments && dto.installments.length > 0) {
      const totalPercentage = dto.installments.reduce((sum, inst) => sum + inst.percentage, 0);
      if (totalPercentage !== 100) {
        throw new BadRequestException(`Installment percentages must add up to 100% (got ${totalPercentage}%)`);
      }
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        organizationId,
        clientId: dto.clientId,
        createdById: userId,
        invoiceNumber,
        issueDate: dto.issueDate,
        dueDate: dto.dueDate,
        subtotal,
        discountType,
        discountPercent,
        discountAmount,
        taxRate: orgTaxRate,
        taxAmount,
        total,
        notes: dto.notes || organization!.defaultNotes || null,
        terms: dto.terms || organization!.paymentTerms || null,
        items: {
          create: items,
        },
        // Create installments if provided
        installments: dto.installments ? {
          create: dto.installments.map((inst, index) => ({
            label: inst.label,
            sequence: index + 1,
            percentage: inst.percentage,
            amount: total * (inst.percentage / 100),
          })),
        } : undefined,
      },
      include: {
        client: true,
        items: true,
        installments: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    return invoice;
  }

  async update(id: string, organizationId: string, dto: UpdateInvoiceDto) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { items: true },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Only allow editing draft invoices
    if (invoice.status !== 'DRAFT') {
      throw new ForbiddenException('Only draft invoices can be edited');
    }

    // Get organization for tax calculation
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { vatEnabled: true, taxRate: true },
    });

    const orgTaxRate = organization!.vatEnabled ? Number(organization!.taxRate) : 0;

    let updateData: Prisma.InvoiceUpdateInput = {
      ...(dto.issueDate && { issueDate: dto.issueDate }),
      ...(dto.dueDate && { dueDate: dto.dueDate }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.terms !== undefined && { terms: dto.terms }),
    };

    // Handle discount update
    if (typeof dto.discountPercent === 'number') {
      updateData.discountPercent = dto.discountPercent;
    }
    if (dto.discountType) {
      updateData.discountType = dto.discountType;
    }

    // If items are being updated or discount changed, recalculate totals
    const discountChanged = typeof dto.discountPercent === 'number' || dto.discountType !== undefined;

    if (dto.items && dto.items.length > 0) {
      // Delete existing items and create new ones
      await this.prisma.invoiceItem.deleteMany({
        where: { invoiceId: id },
      });

      const items = dto.items.map((item) => ({
        invoiceId: id,
        description: item.description || '',
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || 0,
        amount: (item.quantity || 1) * (item.unitPrice || 0),
      }));

      await this.prisma.invoiceItem.createMany({ data: items });

      const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
      const discountType = dto.discountType ?? invoice.discountType;
      const discountValue = dto.discountPercent ?? Number(invoice.discountPercent);
      const discountPercent = discountType === 'FIXED' ? 0 : discountValue;
      const discountAmount = discountType === 'FIXED'
        ? discountValue
        : subtotal * (discountValue / 100);
      const afterDiscount = subtotal - discountAmount;
      const taxAmount = orgTaxRate > 0 ? afterDiscount * (orgTaxRate / 100) : 0;
      const total = afterDiscount + taxAmount;

      updateData = {
        ...updateData,
        subtotal,
        discountType,
        discountPercent,
        discountAmount,
        taxRate: orgTaxRate,
        taxAmount,
        total,
      };
    } else if (discountChanged) {
      // Only discount changed, recalculate
      const subtotal = Number(invoice.subtotal);
      const discountType = dto.discountType ?? invoice.discountType;
      const discountValue = dto.discountPercent ?? Number(invoice.discountPercent);
      const discountPercent = discountType === 'FIXED' ? 0 : discountValue;
      const discountAmount = discountType === 'FIXED'
        ? discountValue
        : subtotal * (discountValue / 100);
      const afterDiscount = subtotal - discountAmount;
      const taxAmount = orgTaxRate > 0 ? afterDiscount * (orgTaxRate / 100) : 0;
      const total = afterDiscount + taxAmount;

      updateData = {
        ...updateData,
        discountType,
        discountPercent,
        discountAmount,
        taxRate: orgTaxRate,
        taxAmount,
        total,
      };
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        client: true,
        items: true,
      },
    });

    return updated;
  }

  async markAsSent(id: string, organizationId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException('Invoice is not in draft status');
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: 'SENT' },
    });

    return updated;
  }

  async cancel(id: string, organizationId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === 'PAID') {
      throw new BadRequestException('Cannot cancel a paid invoice');
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    return updated;
  }

  async remove(id: string, organizationId: string, userRole?: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Super admins can delete any invoice, others can only delete drafts
    const isSuperAdmin = userRole === 'SUPER_ADMIN';
    if (!isSuperAdmin && invoice.status !== 'DRAFT') {
      throw new ForbiddenException('Only draft invoices can be deleted');
    }

    // Soft delete
    await this.prisma.invoice.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Invoice deleted successfully' };
  }

  async generateShareToken(id: string, organizationId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // If already has a share token, return it
    if (invoice.shareToken) {
      return { shareToken: invoice.shareToken };
    }

    // Generate a new unique token
    const shareToken = randomBytes(16).toString('hex');

    await this.prisma.invoice.update({
      where: { id },
      data: { shareToken },
    });

    return { shareToken };
  }

  async findByShareToken(token: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { 
        shareToken: token, 
        deletedAt: null,
        status: { not: 'DRAFT' }, // Don't allow viewing draft invoices
      },
      include: {
        organization: {
          select: {
            name: true,
            email: true,
            phone: true,
            address: true,
          },
        },
        client: {
          select: {
            name: true,
            email: true,
            phone: true,
            address: true,
          },
        },
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            description: true,
            quantity: true,
            unitPrice: true,
            amount: true,
          },
        },
        installments: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return {
      id: invoice.id,
      organizationId: invoice.organizationId,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      subtotal: Number(invoice.subtotal),
      discountType: invoice.discountType,
      discountPercent: Number(invoice.discountPercent),
      discountAmount: Number(invoice.discountAmount),
      taxRate: Number(invoice.taxRate),
      taxAmount: Number(invoice.taxAmount),
      total: Number(invoice.total),
      amountPaid: Number(invoice.amountPaid),
      notes: invoice.notes,
      terms: invoice.terms,
      paymentUrl: invoice.paymentUrl,
      organization: invoice.organization,
      client: invoice.client,
      items: invoice.items.map(item => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        amount: Number(item.amount),
      })),
      installments: invoice.installments.map(inst => ({
        id: inst.id,
        label: inst.label,
        sequence: inst.sequence,
        percentage: Number(inst.percentage),
        amount: Number(inst.amount),
        isPaid: inst.isPaid,
        paymentUrl: inst.paymentUrl,
      })),
    };
  }

  private async generateInvoiceNumber(organizationId: string, prefix: string): Promise<string> {
    const year = new Date().getFullYear();

    // Get the last invoice number for this organization and year
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: {
        organizationId,
        invoiceNumber: {
          startsWith: `${prefix}-${year}-`,
        },
      },
      orderBy: { invoiceNumber: 'desc' },
    });

    let sequence = 1;
    if (lastInvoice) {
      const parts = lastInvoice.invoiceNumber.split('-');
      const lastSequence = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSequence)) {
        sequence = lastSequence + 1;
      }
    }

    return `${prefix}-${year}-${sequence.toString().padStart(4, '0')}`;
  }

  // Service Items Methods
  async findAllServiceItems(organizationId: string) {
    return this.prisma.serviceItem.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createServiceItem(organizationId: string, dto: CreateServiceItemDto) {
    // Check for duplicate name
    const existing = await this.prisma.serviceItem.findUnique({
      where: {
        organizationId_name: { organizationId, name: dto.name },
      },
    });

    if (existing) {
      throw new ConflictException('A service item with this name already exists');
    }

    return this.prisma.serviceItem.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description,
        unitPrice: dto.unitPrice,
      },
    });
  }

  async updateServiceItem(
    id: string,
    organizationId: string,
    dto: UpdateServiceItemDto,
  ) {
    const serviceItem = await this.prisma.serviceItem.findFirst({
      where: { id, organizationId },
    });

    if (!serviceItem) {
      throw new NotFoundException('Service item not found');
    }

    // Check for duplicate name if name is being updated
    if (dto.name && dto.name !== serviceItem.name) {
      const existing = await this.prisma.serviceItem.findUnique({
        where: {
          organizationId_name: { organizationId, name: dto.name },
        },
      });

      if (existing) {
        throw new ConflictException('A service item with this name already exists');
      }
    }

    return this.prisma.serviceItem.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.unitPrice !== undefined && { unitPrice: dto.unitPrice }),
      },
    });
  }

  async removeServiceItem(id: string, organizationId: string) {
    const serviceItem = await this.prisma.serviceItem.findFirst({
      where: { id, organizationId },
    });

    if (!serviceItem) {
      throw new NotFoundException('Service item not found');
    }

    // Soft delete by setting isActive to false
    await this.prisma.serviceItem.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Service item deleted successfully' };
  }
}
