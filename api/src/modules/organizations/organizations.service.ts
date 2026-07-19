import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrganizationDto, CreateDirectorDto, UpdateDirectorDto } from './dto';

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
        rcNumber: true,
        tin: true,
        invoicePrefix: true,
        currency: true,
        taxRate: true,
        vatEnabled: true,
        showQrCode: true,
        paymentTerms: true,
        defaultNotes: true,
        isPaystackVerified: true,
        bankAccountName: true,
        settlementBank: true,
        businessType: true,
        organizationSize: true,
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
        ...(typeof dto.vatEnabled === 'boolean' && { vatEnabled: dto.vatEnabled }),
        ...(typeof dto.showQrCode === 'boolean' && { showQrCode: dto.showQrCode }),
        ...(dto.paymentTerms !== undefined && { paymentTerms: dto.paymentTerms }),
        ...(dto.defaultNotes !== undefined && { defaultNotes: dto.defaultNotes }),
        ...('logo' in dto && { logo: dto.logo }),
        ...(dto.businessType !== undefined && { businessType: dto.businessType }),
        ...(dto.organizationSize !== undefined && { organizationSize: dto.organizationSize }),
        ...(dto.rcNumber !== undefined && { rcNumber: dto.rcNumber }),
        ...(dto.tin !== undefined && { tin: dto.tin }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        address: true,
        logo: true,
        rcNumber: true,
        tin: true,
        invoicePrefix: true,
        currency: true,
        taxRate: true,
        vatEnabled: true,
        showQrCode: true,
        paymentTerms: true,
        defaultNotes: true,
        isPaystackVerified: true,
        businessType: true,
        organizationSize: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  async listDirectors(organizationId: string) {
    return this.prisma.organizationDirector.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createDirector(organizationId: string, dto: CreateDirectorDto) {
    return this.prisma.organizationDirector.create({
      data: { organizationId, ...dto },
    });
  }

  async updateDirector(organizationId: string, directorId: string, dto: UpdateDirectorDto) {
    const director = await this.prisma.organizationDirector.findFirst({
      where: { id: directorId, organizationId },
    });

    if (!director) {
      throw new NotFoundException('Director not found');
    }

    return this.prisma.organizationDirector.update({
      where: { id: directorId },
      data: dto,
    });
  }

  async deleteDirector(organizationId: string, directorId: string) {
    const director = await this.prisma.organizationDirector.findFirst({
      where: { id: directorId, organizationId },
    });

    if (!director) {
      throw new NotFoundException('Director not found');
    }

    await this.prisma.organizationDirector.delete({ where: { id: directorId } });

    return { success: true };
  }

  async getOnboardingStatus(organizationId: string) {
    const [organization, inventoryItemCount, serviceItemCount, clientCount, invoiceCount] =
      await Promise.all([
        this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: {
            email: true,
            address: true,
            isPaystackVerified: true,
            onboardingDismissedAt: true,
            businessType: true,
            organizationSize: true,
            logo: true,
          },
        }),
        this.prisma.inventoryItem.count({
          where: { organizationId, isActive: true },
        }),
        this.prisma.serviceItem.count({
          where: { organizationId, isActive: true },
        }),
        this.prisma.client.count({
          where: { organizationId, isActive: true },
        }),
        this.prisma.invoice.count({
          where: { organizationId, deletedAt: null },
        }),
      ]);

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const steps = {
      businessProfile: !!(organization.address || organization.logo),
      inventoryItems: inventoryItemCount > 0 || serviceItemCount > 0,
      firstClient: clientCount > 0,
      firstInvoice: invoiceCount > 0,
      onlinePayments: organization.isPaystackVerified,
    };

    const completedCount = Object.values(steps).filter(Boolean).length;
    const totalSteps = Object.keys(steps).length;

    return {
      steps,
      completedCount,
      totalSteps,
      allComplete: completedCount === totalSteps,
      dismissed: !!organization.onboardingDismissedAt,
    };
  }

  async dismissOnboarding(organizationId: string) {
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { onboardingDismissedAt: new Date() },
    });

    return { success: true };
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
