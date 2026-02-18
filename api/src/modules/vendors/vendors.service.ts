import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorDto, UpdateVendorDto, VendorFilterDto } from './dto';
import { paginate } from '../../common';

@Injectable()
export class VendorsService {
  constructor(private prisma: PrismaService) {}

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

    return vendor;
  }

  async update(id: string, organizationId: string, dto: UpdateVendorDto) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, organizationId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const updated = await this.prisma.vendor.update({
      where: { id },
      data: dto,
    });

    return updated;
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
