import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentTypeDto, UpdatePaymentTypeDto } from './dto';

// PAYSTACK/WALLET are hardcoded, code-tied payment methods (checkout flow / wallet debit) —
// never part of the org-managed list, so no custom type may claim either name.
const RESERVED_NAMES = ['PAYSTACK', 'WALLET'];

@Injectable()
export class PaymentTypesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    const existing = await this.prisma.paymentType.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (existing.length > 0) return existing;

    // Lazily seed the 4 default methods the first time an org (new, or newly POS-enabled) asks
    // for its payment types — covers every path that can flip an org onto POS without needing
    // to hook every place enabledModules gets written.
    return this.seedDefaults(organizationId);
  }

  private async seedDefaults(organizationId: string) {
    const defaults = [
      { name: 'CASH', sortOrder: 0 },
      { name: 'BANK_TRANSFER', sortOrder: 1 },
      { name: 'CARD', sortOrder: 2 },
      { name: 'OTHER', sortOrder: 3 },
    ];
    await this.prisma.paymentType.createMany({
      data: defaults.map((d) => ({ organizationId, ...d })),
      skipDuplicates: true,
    });
    return this.prisma.paymentType.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // Case-insensitive dedupe guard — same rationale as OrderTypesService.
  private async assertNameAvailable(organizationId: string, name: string, excludeId?: string) {
    if (RESERVED_NAMES.includes(name.toUpperCase())) {
      throw new BadRequestException(`"${name}" is reserved and can't be used for a custom payment type`);
    }
    const existing = await this.prisma.paymentType.findFirst({
      where: {
        organizationId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
    if (existing) {
      throw new ConflictException('A payment type with this name already exists');
    }
  }

  async create(organizationId: string, dto: CreatePaymentTypeDto) {
    const name = dto.name.trim();
    await this.assertNameAvailable(organizationId, name);

    return this.prisma.paymentType.create({
      data: {
        organizationId,
        name,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async update(organizationId: string, id: string, dto: UpdatePaymentTypeDto) {
    const paymentType = await this.prisma.paymentType.findFirst({ where: { id, organizationId } });
    if (!paymentType) throw new NotFoundException('Payment type not found');

    const name = dto.name?.trim();
    if (name && name.toLowerCase() !== paymentType.name.toLowerCase()) {
      await this.assertNameAvailable(organizationId, name, id);
    }

    return this.prisma.paymentType.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(organizationId: string, id: string) {
    const paymentType = await this.prisma.paymentType.findFirst({ where: { id, organizationId } });
    if (!paymentType) throw new NotFoundException('Payment type not found');

    await this.prisma.paymentType.update({ where: { id }, data: { isActive: false } });
    return { message: 'Payment type deleted successfully' };
  }

  /**
   * Whether `name` is a valid way to close an order — either the reserved PAYSTACK/WALLET
   * literals (handled entirely outside this table, by OrdersService) or an active PaymentType
   * for the org. Used by OrdersService.closeWithPayment in place of the old hardcoded
   * `@IsIn(PAYMENT_METHODS)` DTO-level enum check.
   */
  async exists(organizationId: string, name: string): Promise<boolean> {
    if (RESERVED_NAMES.includes(name)) return true;
    const paymentType = await this.prisma.paymentType.findFirst({
      where: { organizationId, name, isActive: true },
    });
    return !!paymentType;
  }
}
