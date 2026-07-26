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
      },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
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

  private async cashTakenDuringShift(organizationId: string, openedAt: Date, until: Date) {
    const result = await this.prisma.payment.aggregate({
      where: {
        organizationId,
        paymentMethod: 'CASH',
        createdAt: { gte: openedAt, lte: until },
      },
      _sum: { amount: true },
    });
    return toNumber(result._sum.amount ?? 0);
  }

  async close(organizationId: string, id: string, userId: string, dto: CloseShiftDto) {
    const shift = await this.prisma.shift.findFirst({ where: { id, organizationId } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.status !== 'OPEN') {
      throw new BadRequestException('Shift is already closed');
    }

    const closedAt = new Date();
    const cashTaken = await this.cashTakenDuringShift(organizationId, shift.openedAt, closedAt);
    const expectedCash = toNumber(shift.openingFloat) + cashTaken;
    const variance = dto.countedCash - expectedCash;

    return this.prisma.shift.update({
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
    });
  }
}
