import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  InvoiceFilterDto,
  CreateServiceItemDto,
  UpdateServiceItemDto,
} from './dto';
import { paginate, PLAN_LIMITS } from '../../common';
import { InventoryService } from '../inventory/inventory.service';
import { PaystackService } from '../paystack/paystack.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  private readonly lastCheckedReferences = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private paystackService: PaystackService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

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
            logo: true,
            planTier: true,
            subscriptionStatus: true,
            showQrCode: true,
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
      ...(item.serviceItemId && { serviceItemId: item.serviceItemId }),
      ...(item.inventoryItemId && { inventoryItemId: item.inventoryItemId }),
    }));

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const discountType = dto.discountType || 'PERCENTAGE';
    const discountValue = dto.discountPercent || 0;
    const discountPercent = discountType === 'FIXED' ? 0 : discountValue;
    const discountAmount = discountType === 'FIXED'
      ? discountValue
      : subtotal * (discountValue / 100);
    const afterDiscount = subtotal - discountAmount;
    const orgTaxRate = dto.taxRate !== undefined ? dto.taxRate : (organization!.vatEnabled ? Number(organization!.taxRate) : 0);
    const taxAmount = orgTaxRate > 0 ? afterDiscount * (orgTaxRate / 100) : 0;
    const total = afterDiscount + taxAmount;

    // Validate installments if provided
    if (dto.installments && dto.installments.length > 0) {
      const totalPercentage = dto.installments.reduce((sum, inst) => sum + inst.percentage, 0);
      if (totalPercentage !== 100) {
        throw new BadRequestException(`Installment percentages must add up to 100% (got ${totalPercentage}%)`);
      }
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
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
          shareToken: randomBytes(16).toString('hex'),
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

      // Reserve inventory for items with inventoryItemId
      const inventoryItems = dto.items
        .filter((item) => item.inventoryItemId)
        .map((item) => ({ inventoryItemId: item.inventoryItemId!, quantity: item.quantity }));

      if (inventoryItems.length > 0) {
        await this.inventoryService.reserveForInvoice(tx, created.id, organizationId, inventoryItems);
      }

      return created;
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

    const orgTaxRate = dto.taxRate !== undefined
      ? dto.taxRate
      : (organization!.vatEnabled ? Number(organization!.taxRate) : Number(invoice.taxRate));

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
      // Release existing inventory reservations, delete items, create new ones, re-reserve
      await this.prisma.$transaction(async (tx) => {
        // Release old inventory reservations
        await this.inventoryService.releaseReservation(tx, id, organizationId);

        // Delete existing items and create new ones
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

        const items = dto.items!.map((item) => ({
          invoiceId: id,
          description: item.description || '',
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0,
          amount: (item.quantity || 1) * (item.unitPrice || 0),
          ...(item.serviceItemId && { serviceItemId: item.serviceItemId }),
          ...(item.inventoryItemId && { inventoryItemId: item.inventoryItemId }),
        }));

        await tx.invoiceItem.createMany({ data: items });

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

        await tx.invoice.update({ where: { id }, data: updateData });

        // Re-reserve inventory for new items
        const inventoryItems = dto.items!
          .filter((item) => item.inventoryItemId)
          .map((item) => ({ inventoryItemId: item.inventoryItemId!, quantity: item.quantity || 1 }));

        if (inventoryItems.length > 0) {
          await this.inventoryService.reserveForInvoice(tx, id, organizationId, inventoryItems);
        }
      });

      return this.prisma.invoice.findFirst({
        where: { id },
        include: { client: true, items: true },
      });
    } else if (discountChanged || dto.taxRate !== undefined) {
      // Only discount or tax rate changed, recalculate
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
      include: {
        client: { select: { name: true, email: true } },
        organization: { select: { name: true, paystackSubaccountCode: true } },
        installments: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException('Invoice is not in draft status');
    }

    await this.prisma.invoice.update({
      where: { id },
      data: { status: 'SENT' },
    });

    // Best-effort: auto-generate the payment link(s) so the invoice is
    // immediately payable the moment it's shared, without a manual step.
    // `paymentLinkWarning` surfaces back to the UI when Paystack is connected
    // but link generation couldn't run/succeed, so the failure isn't silent.
    let paymentLinkWarning: string | null = null;

    if (invoice.organization.paystackSubaccountCode) {
      if (!invoice.client.email) {
        paymentLinkWarning =
          'Online payment link could not be created because this client has no email address on file. Add one, then reopen this invoice to generate it.';
      } else if (invoice.installments.length > 0) {
        const failedLabels: string[] = [];
        for (const installment of invoice.installments.filter((inst) => !inst.isPaid && !inst.paymentUrl)) {
          try {
            await this.paystackService.initializeInstallmentTransaction(
              organizationId,
              id,
              installment.id,
              invoice.client.email,
              Number(installment.amount),
            );
          } catch (err) {
            this.logger.error(
              `Failed to auto-generate payment link for installment ${installment.label} of ${invoice.invoiceNumber}: ${err.message}`,
            );
            failedLabels.push(installment.label);
          }
        }
        if (failedLabels.length > 0) {
          paymentLinkWarning = `Online payment link could not be created for: ${failedLabels.join(', ')}. Check your Paystack setup and try again.`;
        }
      } else {
        try {
          const outstanding = Number(invoice.total) - Number(invoice.amountPaid);
          await this.paystackService.initializeTransaction(organizationId, id, invoice.client.email, outstanding);
        } catch (err) {
          this.logger.error(`Failed to auto-generate payment link for ${invoice.invoiceNumber}: ${err.message}`);
          paymentLinkWarning = 'Online payment link could not be created. Check your Paystack setup and try again.';
        }
      }
    }

    const updated = await this.prisma.invoice.findFirst({ where: { id } });

    if (invoice.client.email) {
      const dueDate = invoice.dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const total = Number(invoice.total).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
      const frontendUrl = this.configService.get<string>('resend.frontendUrl') || 'http://localhost:5173';
      const viewUrl = invoice.shareToken ? `${frontendUrl.replace(/\/$/, '')}/i/${invoice.shareToken}` : null;

      try {
        await this.emailService.sendInvoiceEmail(
          invoice.client.email,
          invoice.client.name,
          invoice.invoiceNumber,
          invoice.organization.name,
          total,
          dueDate,
          updated?.paymentUrl ?? null,
          viewUrl,
        );
      } catch (err) {
        this.logger.error(`Failed to send invoice email for ${invoice.invoiceNumber}: ${err.message}`);
      }
    }

    return { ...updated, paymentLinkWarning };
  }

  async cancel(id: string, organizationId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (Number(invoice.amountPaid) > 0) {
      throw new BadRequestException('Cannot cancel an invoice that has received payment');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Release inventory reservations (only if not already cancelled)
      if (invoice.status !== 'CANCELLED') {
        await this.inventoryService.releaseReservation(tx, id, organizationId);
      }

      return tx.invoice.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
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

    // Invoices with any recorded payment can never be deleted, regardless of role —
    // deleting would remove them from every report/listing while the underlying
    // Payment/PaymentInstallment rows (real money already collected) remain orphaned.
    if (Number(invoice.amountPaid) > 0) {
      throw new BadRequestException('Cannot delete an invoice that has received payment');
    }

    // Super admins can delete any unpaid invoice, others can only delete drafts
    const isSuperAdmin = userRole === 'SUPER_ADMIN';
    if (!isSuperAdmin && invoice.status !== 'DRAFT') {
      throw new ForbiddenException('Only draft invoices can be deleted');
    }

    // Soft delete with inventory cleanup
    await this.prisma.$transaction(async (tx) => {
      // Release inventory reservations if invoice has active reservations
      if (invoice.status !== 'PAID' && invoice.status !== 'CANCELLED') {
        await this.inventoryService.releaseReservation(tx, id, organizationId);
      }

      await tx.invoice.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });

    return { message: 'Invoice deleted successfully' };
  }

  async sendReminder(id: string, organizationId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        client: { select: { name: true, email: true } },
        organization: { select: { name: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== 'SENT' && invoice.status !== 'OVERDUE') {
      throw new BadRequestException('Reminders can only be sent for SENT or OVERDUE invoices');
    }

    if (!invoice.client.email) {
      throw new BadRequestException('Client does not have an email address');
    }

    const dueDate = invoice.dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const total = Number(invoice.total).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
    const outstanding = (Number(invoice.total) - Number(invoice.amountPaid)).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });

    await this.emailService.sendInvoiceReminderEmail(
      invoice.client.email,
      invoice.client.name,
      invoice.invoiceNumber,
      invoice.organization.name,
      dueDate,
      total,
      outstanding,
      invoice.paymentUrl,
    );

    return { message: 'Reminder sent successfully' };
  }

  async markOverdueInvoices() {
    const result = await this.prisma.invoice.updateMany({
      where: {
        status: 'SENT',
        dueDate: { lt: new Date() },
        deletedAt: null,
      },
      data: { status: 'OVERDUE' },
    });

    if (result.count > 0) {
      this.logger.log(`Marked ${result.count} invoice(s) as overdue`);
    }

    return result;
  }

  async duplicate(id: string, organizationId: string, userId: string) {
    const source = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { items: true },
    });

    if (!source) {
      throw new NotFoundException('Invoice not found');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { invoicePrefix: true },
    });

    const invoiceNumber = await this.generateInvoiceNumber(organizationId, organization!.invoicePrefix);

    // Shift issue/due dates relative to today
    const originalDurationMs = source.dueDate.getTime() - source.issueDate.getTime();
    const issueDate = new Date();
    issueDate.setHours(0, 0, 0, 0);
    const dueDate = new Date(issueDate.getTime() + originalDurationMs);

    const newInvoice = await this.prisma.invoice.create({
      data: {
        organizationId,
        clientId: source.clientId,
        createdById: userId,
        invoiceNumber,
        issueDate,
        dueDate,
        subtotal: source.subtotal,
        discountType: source.discountType,
        discountPercent: source.discountPercent,
        discountAmount: source.discountAmount,
        taxRate: source.taxRate,
        taxAmount: source.taxAmount,
        total: source.total,
        notes: source.notes,
        terms: source.terms,
        shareToken: randomBytes(16).toString('hex'),
        status: 'DRAFT',
        items: {
          create: source.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.amount,
            ...(item.serviceItemId && { serviceItemId: item.serviceItemId }),
          })),
        },
      },
      include: {
        client: true,
        items: true,
      },
    });

    return newInvoice;
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

  async resolveShortLink(slug: string): Promise<string> {
    const link = await this.prisma.shortLink.findUnique({
      where: { slug },
    });
    if (!link) {
      throw new NotFoundException('Short link not found');
    }
    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new NotFoundException('Short link has expired');
    }
    return link.targetUrl;
  }

  async findByShareToken(token: string) {
    let invoice = await this.prisma.invoice.findFirst({
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
            logo: true,
            planTier: true,
            subscriptionStatus: true,
            showQrCode: true,
            paystackSubaccountCode: true,
            bankAccountNumber: true,
            bankAccountName: true,
            settlementBank: true,
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

    // Auto-generate payment link and transaction reference if missing or expired (older than 20 mins)
    const balanceDue = Number(invoice.total) - Number(invoice.amountPaid);
    if (balanceDue > 0 && invoice.client.email && invoice.organization.paystackSubaccountCode) {
      try {
        let updated = false;
        const TOKEN_EXPIRY_MS = 20 * 60 * 1000; // 20 minutes
        const now = new Date();

        // Fallback check: try to reconcile any pending transactions before proceeding
        const referencesToCheck: string[] = [];
        if (invoice.installments && invoice.installments.length > 0) {
          for (const inst of invoice.installments) {
            if (!inst.isPaid && inst.paystackReference) {
              referencesToCheck.push(inst.paystackReference);
            }
          }
        } else if (invoice.paystackReference) {
          referencesToCheck.push(invoice.paystackReference);
        }

        for (const ref of referencesToCheck) {
          const lastChecked = this.lastCheckedReferences.get(ref) || 0;
          if (Date.now() - lastChecked > 30000) {
            this.lastCheckedReferences.set(ref, Date.now());
            try {
              const verification = await this.paystackService.verifyTransaction(ref);
              if (verification && verification.status === 'success') {
                updated = true;
              }
            } catch (err) {
              // Ignore verification errors for individual references
            }
          }
        }

        if (invoice.installments && invoice.installments.length > 0) {
          for (const inst of invoice.installments) {
            const tokenAge = inst.paystackTokenGeneratedAt
              ? now.getTime() - new Date(inst.paystackTokenGeneratedAt).getTime()
              : Infinity;

            if (!inst.isPaid && (!inst.paymentUrl || !inst.paystackAccessCode || tokenAge > TOKEN_EXPIRY_MS)) {
              await this.paystackService.initializeInstallmentTransaction(
                invoice.organizationId,
                invoice.id,
                inst.id,
                invoice.client.email,
                Number(inst.amount),
              );
              updated = true;
            }
          }
        } else {
          const tokenAge = invoice.paystackTokenGeneratedAt
            ? now.getTime() - new Date(invoice.paystackTokenGeneratedAt).getTime()
            : Infinity;

          if (!invoice.paymentUrl || !invoice.paystackAccessCode || tokenAge > TOKEN_EXPIRY_MS) {
            await this.paystackService.initializeTransaction(
              invoice.organizationId,
              invoice.id,
              invoice.client.email,
              balanceDue,
            );
            updated = true;
          }
        }

        if (updated) {
          // Re-fetch invoice with new payment parameters
          const refreshed = await this.prisma.invoice.findFirst({
            where: { id: invoice.id },
            include: {
              organization: {
                select: {
                  name: true,
                  email: true,
                  phone: true,
                  address: true,
                  logo: true,
                  planTier: true,
                  subscriptionStatus: true,
                  showQrCode: true,
                  paystackSubaccountCode: true,
                  bankAccountNumber: true,
                  bankAccountName: true,
                  settlementBank: true,
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
          if (refreshed) {
            invoice = refreshed;
          }
        }
      } catch (error) {
        console.error('Failed to auto-generate payment link on findByShareToken:', error);
      }
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
      paystackAccessCode: invoice.paystackAccessCode,
      paystackReference: invoice.paystackReference,
      paystackPublicKey: this.paystackService.publicKey,
      paystackSubaccountCode: invoice.organization.paystackSubaccountCode,
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
        paystackReference: inst.paystackReference,
        paystackAccessCode: inst.paystackAccessCode,
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
