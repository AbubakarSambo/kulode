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

  async getOnboardingStatus(organizationId: string) {
    const [organization, inventoryItemCount, clientCount, invoiceCount, expenseCategoryCount] =
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
          },
        }),
        this.prisma.inventoryItem.count({
          where: { organizationId, isActive: true },
        }),
        this.prisma.client.count({
          where: { organizationId, isActive: true },
        }),
        this.prisma.invoice.count({
          where: { organizationId, deletedAt: null },
        }),
        this.prisma.expenseCategory.count({
          where: { organizationId, isActive: true },
        }),
      ]);

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const steps = {
      businessProfile: !!(organization.businessType && organization.organizationSize),
      inventoryItems: inventoryItemCount > 0,
      firstClient: clientCount > 0,
      firstInvoice: invoiceCount > 0,
      onlinePayments: organization.isPaystackVerified,
      expenseCategories: expenseCategoryCount > 0,
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
