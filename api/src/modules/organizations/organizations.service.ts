import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrganizationDto } from './dto';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        address: true,
        logo: true,
        invoicePrefix: true,
        currency: true,
        taxRate: true,
        paymentTerms: true,
        defaultNotes: true,
        isPaystackVerified: true,
        bankAccountName: true,
        settlementBank: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async update(id: string, dto: UpdateOrganizationDto) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.email && { email: dto.email }),
        ...(dto.phone && { phone: dto.phone }),
        ...(dto.address && { address: dto.address }),
        ...(dto.invoicePrefix && { invoicePrefix: dto.invoicePrefix }),
        ...(typeof dto.taxRate === 'number' && { taxRate: dto.taxRate }),
        ...(dto.paymentTerms !== undefined && { paymentTerms: dto.paymentTerms }),
        ...(dto.defaultNotes !== undefined && { defaultNotes: dto.defaultNotes }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        address: true,
        logo: true,
        invoicePrefix: true,
        currency: true,
        taxRate: true,
        paymentTerms: true,
        defaultNotes: true,
        isPaystackVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  async getPaystackStatus(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      select: {
        isPaystackVerified: true,
        bankAccountName: true,
        settlementBank: true,
        paystackSubaccountCode: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return {
      isSetup: !!organization.paystackSubaccountCode,
      isVerified: organization.isPaystackVerified,
      bankAccountName: organization.bankAccountName,
      settlementBank: organization.settlementBank,
    };
  }
}
