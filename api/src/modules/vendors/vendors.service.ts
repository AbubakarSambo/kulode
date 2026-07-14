import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { CreateVendorDto, UpdateVendorDto, VendorFilterDto } from './dto';
import { paginate } from '../../common';

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(
    private prisma: PrismaService,
    private paystackService: PaystackService,
  ) {}

  async findAll(organizationId: string, filter: VendorFilterDto) {
    const { page = 1, limit = 20, search } = filter;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [vendors, total] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vendor.count({ where }),
    ]);

    return paginate(vendors, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, organizationId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return vendor;
  }

  async create(organizationId: string, dto: CreateVendorDto) {
    const vendor = await this.prisma.vendor.create({
      data: {
        organizationId,
        ...dto,
      },
    });

    if (dto.bankCode && dto.bankAccountNumber) {
      await this.setUpPayouts(vendor.id, organizationId);
    }

    return this.findOne(vendor.id, organizationId);
  }

  async update(id: string, organizationId: string, dto: UpdateVendorDto) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, organizationId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    await this.prisma.vendor.update({
      where: { id },
      data: dto,
    });

    if (dto.bankCode && dto.bankAccountNumber) {
      await this.setUpPayouts(id, organizationId);
    }

    return this.findOne(id, organizationId);
  }

  /**
   * Verifies the vendor's bank details and provisions/refreshes their Paystack subaccount.
   * Bank details are optional bookkeeping fields, so a verification failure here doesn't
   * block saving the vendor — it just leaves the vendor unable to receive real payouts
   * (paystackSubaccountStatus: FAILED) until the details are corrected.
   */
  private async setUpPayouts(vendorId: string, organizationId: string) {
    try {
      await this.paystackService.createVendorSubaccount(vendorId, organizationId);
    } catch (error) {
      this.logger.warn(`Vendor payout setup failed for vendor ${vendorId}: ${error.message}`);
      await this.prisma.vendor.update({
        where: { id: vendorId },
        data: { paystackSubaccountStatus: 'FAILED' },
      });
    }
  }

  async remove(id: string, organizationId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, organizationId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    await this.prisma.vendor.delete({ where: { id } });

    return { message: 'Vendor deleted successfully' };
  }
}
