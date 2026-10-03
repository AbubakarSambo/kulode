import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { OpenShiftDto, CloseShiftDto, BackdateShiftDto } from './dto';

function toNumber(val: Prisma.Decimal | number): number {
  return typeof val === 'number' ? val : Number(val);
}

@Injectable()
export class ShiftsService {
  private readonly logger = new Logger(ShiftsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
  ) {}

  async findAll(organizationId: string) {
    return this.prisma.shift.findMany({
      where: { organizationId },
      orderBy: { openedAt: 'desc' },
      include: {
        openedBy: { select: { id: true, firstName: true, lastName: true } },
        closedBy: { select: { id: true, firstName: true, lastName: true } },
        breakdowns: true,
      },
    });
  }

  async findCurrent(organizationId: string) {
    return this.prisma.shift.findFirst({
      where: { organizationId, status: 'OPEN' },
      include: {
        openedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findOne(organizationId: string, id: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, organizationId },
      include: {
        openedBy: { select: { id: true, firstName: true, lastName: true } },
        closedBy: { select: { id: true, firstName: true, lastName: true } },
        breakdowns: true,
      },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  async getReportData(organizationId: string, id: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, organizationId },
      include: {
        openedBy: { select: { id: true, firstName: true, lastName: true } },
        closedBy: { select: { id: true, firstName: true, lastName: true } },
        breakdowns: true,
        organization: {
          select: {
            name: true,
            address: true,
            phone: true,
            currency: true,
            taxRate: true,
            entertainmentTaxRate: true,
            serviceChargeRate: true,
          },
        },
      },
    });
    if (!shift) throw new NotFoundException('Shift not found');

    const [categoryTotals, taxTotals] = await Promise.all([
      this.categorySalesDuringShift(organizationId, shift.openedAt, shift.closedAt ?? new Date()),
      this.taxSummaryDuringShift(organizationId, shift.openedAt, shift.closedAt ?? new Date()),
    ]);

    return {
      ...shift,
      openingFloat: toNumber(shift.openingFloat),
      expectedCash: shift.expectedCash ? toNumber(shift.expectedCash) : null,
      countedCash: shift.countedCash ? toNumber(shift.countedCash) : null,
      variance: shift.variance ? toNumber(shift.variance) : null,
      breakdowns: shift.breakdowns.map((b) => ({
        paymentMethod: b.paymentMethod,
        expectedAmount: toNumber(b.expectedAmount),
        countedAmount: toNumber(b.countedAmount),
        variance: toNumber(b.variance),
      })),
      categoryTotals,
      discountAmount: taxTotals.discountAmount,
      taxTotals: {
        vatAmount: taxTotals.vatAmount,
        entertainmentTaxAmount: taxTotals.entertainmentTaxAmount,
        serviceChargeAmount: taxTotals.serviceChargeAmount,
        vatRate: toNumber(shift.organization.taxRate),
        entertainmentTaxRate: toNumber(shift.organization.entertainmentTaxRate),
        serviceChargeRate: toNumber(shift.organization.serviceChargeRate),
      },
    };
  }

  // Sales-by-category breakdown for the "Items Detail" section of the shift report — mirrors
  // paymentBreakdownDuringShift but sourced from orders closed (paid) during the shift window
  // rather than payments, since a category lives on the order's items, not its payment.
  private async categorySalesDuringShift(organizationId: string, openedAt: Date, until: Date) {
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: { organizationId, status: 'CLOSED_PAID', closedAt: { gte: openedAt, lte: until } },
      },
      select: {
        amount: true,
        menuItem: {
          select: { categories: { select: { category: { select: { name: true } } }, take: 1 } },
        },
      },
    });

    const totals = new Map<string, number>();
    for (const item of items) {
      const category = item.menuItem?.categories[0]?.category.name ?? 'Uncategorized';
      totals.set(category, (totals.get(category) ?? 0) + toNumber(item.amount));
    }

    return Array.from(totals, ([category, amount]) => ({ category, amount }));
  }

  // Tax/service-charge/discount totals for the shift report, summed off the same closed-orders
  // window as categorySalesDuringShift. Discounts are bundled in here (one aggregate query,
  // same where clause) rather than the "Items Detail" section — discountAmount is an order-level
  // deduction, not something attributable to any one category.
  private async taxSummaryDuringShift(organizationId: string, openedAt: Date, until: Date) {
    const result = await this.prisma.order.aggregate({
      where: { organizationId, status: 'CLOSED_PAID', closedAt: { gte: openedAt, lte: until } },
      _sum: { vatAmount: true, entertainmentTaxAmount: true, serviceChargeAmount: true, discountAmount: true },
    });

    return {
      vatAmount: toNumber(result._sum.vatAmount ?? 0),
      entertainmentTaxAmount: toNumber(result._sum.entertainmentTaxAmount ?? 0),
      serviceChargeAmount: toNumber(result._sum.serviceChargeAmount ?? 0),
      discountAmount: toNumber(result._sum.discountAmount ?? 0),
    };
  }

  // Live per-payment-method totals for the currently open shift, so the close form can be
  // pre-populated before the till is actually closed.
  async previewClose(organizationId: string, id: string) {
    const shift = await this.prisma.shift.findFirst({ where: { id, organizationId } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.status !== 'OPEN') {
      throw new BadRequestException('Shift is already closed');
    }

    const breakdown = await this.paymentBreakdownDuringShift(organizationId, shift.openedAt, new Date());
    return { openingFloat: toNumber(shift.openingFloat), breakdown };
  }

  async open(organizationId: string, userId: string, dto: OpenShiftDto) {
    const existingOpen = await this.prisma.shift.findFirst({
      where: { organizationId, status: 'OPEN' },
    });
    if (existingOpen) {
      throw new BadRequestException('A shift is already open for this organization');
    }

    return this.prisma.shift.create({
      data: {
        organizationId,
        openedById: userId,
        openingFloat: dto.openingFloat ?? 0,
      },
    });
  }

  // Admin-only escape hatch for a staff member who forgot to open the till: backdates the shift's
  // openedAt to when it should have started, so reports/reconciliation bucket sales correctly
  // instead of everything landing in whatever shift eventually does get opened.
  async openBackdated(organizationId: string, actingUserId: string, dto: BackdateShiftDto) {
    const existingOpen = await this.prisma.shift.findFirst({
      where: { organizationId, status: 'OPEN' },
    });
    if (existingOpen) {
      throw new BadRequestException('A shift is already open for this organization');
    }

    const openedAt = new Date(dto.openedAt);
    if (openedAt.getTime() > Date.now()) {
      throw new BadRequestException('openedAt cannot be in the future');
    }

    let openedById = actingUserId;
    if (dto.staffId) {
      const staff = await this.prisma.user.findFirst({ where: { id: dto.staffId, organizationId } });
      if (!staff) throw new NotFoundException('Staff member not found');
      openedById = staff.id;
    }

    return this.prisma.shift.create({
      data: {
        organizationId,
        openedById,
        openedAt,
        openingFloat: dto.openingFloat ?? 0,
        notes: dto.notes,
      },
    });
  }

  private async paymentBreakdownDuringShift(organizationId: string, openedAt: Date, until: Date) {
    const grouped = await this.prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: { organizationId, createdAt: { gte: openedAt, lte: until } },
      _sum: { amount: true },
    });
    const breakdown = grouped.map((row) => ({
      paymentMethod: row.paymentMethod,
      expectedAmount: toNumber(row._sum.amount ?? 0),
    }));
    // Cash always needs reconciling against the opening float, even with zero cash sales.
    if (!breakdown.some((b) => b.paymentMethod === 'CASH')) {
      breakdown.unshift({ paymentMethod: 'CASH', expectedAmount: 0 });
    }
    return breakdown;
  }

  async close(organizationId: string, id: string, userId: string, dto: CloseShiftDto) {
    const shift = await this.prisma.shift.findFirst({ where: { id, organizationId } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.status !== 'OPEN') {
      throw new BadRequestException('Shift is already closed');
    }

    const closedAt = new Date();
    const breakdown = await this.paymentBreakdownDuringShift(organizationId, shift.openedAt, closedAt);

    const cashTaken = breakdown.find((b) => b.paymentMethod === 'CASH')?.expectedAmount ?? 0;
    const expectedCash = toNumber(shift.openingFloat) + cashTaken;
    const variance = dto.countedCash - expectedCash;

    const breakdownRows = breakdown.map(({ paymentMethod, expectedAmount }) => {
      const isCash = paymentMethod === 'CASH';
      // countedCash is the full till count (float + cash taken), matching expectedCash.
      const countedAmount = isCash ? dto.countedCash : dto.countedAmounts?.[paymentMethod] ?? expectedAmount;
      const rowExpected = isCash ? expectedCash : expectedAmount;
      return {
        shiftId: id,
        paymentMethod,
        expectedAmount: rowExpected,
        countedAmount,
        variance: countedAmount - rowExpected,
      };
    });

    const [, , updatedShift] = await this.prisma.$transaction([
      this.prisma.shiftPaymentBreakdown.deleteMany({ where: { shiftId: id } }),
      this.prisma.shiftPaymentBreakdown.createMany({ data: breakdownRows }),
      this.prisma.shift.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closedById: userId,
          closedAt,
          expectedCash,
          countedCash: dto.countedCash,
          variance,
          notes: dto.notes,
        },
      }),
    ]);

    try {
      await this.sendShiftSummary(organizationId, shift.openedAt, closedAt, variance, breakdown);
    } catch (err) {
      // The shift is already closed at this point - a failure here shouldn't fail the close.
      this.logger.error(`Failed to build shift close sales summary for org ${organizationId}: ${err.message}`);
    }

    return this.findOne(organizationId, updatedShift.id);
  }

  // Fires the WhatsApp summary when a shift closes, scoped to *this specific shift's* own
  // openedAt..closedAt window — not the org's wider business-day window. If an org runs more
  // than one shift per business day, each shift gets its own report rather than a running
  // cross-shift total; variance and the payment breakdown are this shift's own (already computed
  // by close() right before this is called), not re-aggregated across every shift closed today.
  private async sendShiftSummary(
    organizationId: string,
    openedAt: Date,
    closedAt: Date,
    variance: number,
    breakdown: Array<{ paymentMethod: string; expectedAmount: number }>,
  ): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, ownerWhatsappPhone: true, enabledModules: true },
    });
    if (!org || !['POS', 'BOTH'].includes(org.enabledModules)) return;

    const phones = (org.ownerWhatsappPhone ?? '').split(',').map((p) => p.trim()).filter(Boolean);
    if (phones.length === 0) return;

    const [closedPaidAgg, closedUnpaidAgg, totalPaymentsAgg, creditRepaymentsAgg, depositsAgg] = await Promise.all([
      this.prisma.order.aggregate({
        where: { organizationId, status: OrderStatus.CLOSED_PAID, closedAt: { gte: openedAt, lte: closedAt } },
        _sum: { total: true },
        _count: { id: true },
      }),
      this.prisma.order.aggregate({
        where: { organizationId, status: OrderStatus.CLOSED_UNPAID, closedAt: { gte: openedAt, lte: closedAt } },
        _sum: { total: true, amountPaid: true },
        _count: { id: true },
      }),
      // Every payment that actually landed during this shift, regardless of which order/day it
      // belongs to — the honest "total money collected" figure, not a derived sum of the buckets
      // below.
      this.prisma.payment.aggregate({
        where: { organizationId, createdAt: { gte: openedAt, lte: closedAt } },
        _sum: { amount: true },
      }),
      // Collected during this shift, but for an order that was finalized *before this shift
      // opened* — i.e. money collected now against old credit, not this shift's own sales.
      this.prisma.payment.aggregate({
        where: {
          organizationId,
          createdAt: { gte: openedAt, lte: closedAt },
          order: { closedAt: { lt: openedAt } },
        },
        _sum: { amount: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: { organizationId, type: 'TOPUP', createdAt: { gte: openedAt, lte: closedAt } },
        _sum: { amount: true },
      }),
    ]);

    const closedPaidTotal = toNumber(closedPaidAgg._sum.total ?? 0);
    const closedUnpaidTotal = toNumber(closedUnpaidAgg._sum.total ?? 0);
    const orderCount = closedPaidAgg._count.id + closedUnpaidAgg._count.id;
    const totalSales = closedPaidTotal + closedUnpaidTotal;
    const avgOrder = orderCount > 0 ? totalSales / orderCount : 0;
    const totalCollected = toNumber(totalPaymentsAgg._sum.amount ?? 0) + toNumber(depositsAgg._sum.amount ?? 0);
    const creditRepayments = toNumber(creditRepaymentsAgg._sum.amount ?? 0);
    const deposits = toNumber(depositsAgg._sum.amount ?? 0);

    const dayLabel = closedAt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const formatClock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const dateRange = `${dayLabel} (${formatClock(openedAt)} – ${formatClock(closedAt)})`;
    const currency = (value: number) => value.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
    const paymentBreakdownLine = breakdown
      .map((row) => `${row.paymentMethod}: ${currency(row.expectedAmount)}`)
      .join(' | ');

    for (const phone of phones) {
      try {
        await this.whatsappService.sendShiftReportTemplate({
          organizationId,
          toPhone: phone,
          orgName: org.name,
          dateRange,
          totalSales: currency(totalSales),
          orderCount: String(orderCount),
          avgOrder: currency(avgOrder),
          // Mirrors Total Sales rather than being separately tracked — see plan notes.
          totalPayments: currency(totalSales),
          paidToday: currency(closedPaidTotal),
          creditSales: currency(closedUnpaidTotal),
          variance: currency(variance),
          totalCollected: currency(totalCollected),
          todaysSales: currency(closedPaidTotal),
          creditRepayments: currency(creditRepayments),
          deposits: currency(deposits),
          paymentBreakdown: paymentBreakdownLine,
        });
      } catch (err) {
        this.logger.error(`Failed to send shift close report to ${phone} for org ${organizationId}: ${err.message}`);
      }
    }
  }
}
