import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OpenShiftDto, CloseShiftDto } from './dto';

function toNumber(val: Prisma.Decimal | number): number {
  return typeof val === 'number' ? val : Number(val);
}

@Injectable()
export class ShiftsService {
  constructor(private prisma: PrismaService) {}

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
          select: { name: true, address: true, phone: true, currency: true },
        },
      },
    });
    if (!shift) throw new NotFoundException('Shift not found');

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

    return this.findOne(organizationId, updatedShift.id);
  }
}
