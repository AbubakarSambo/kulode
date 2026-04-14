import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto, UpdateExpenseDto, ExpenseFilterDto, CreateExpenseCategoryDto, BulkRecategorizeDto, TaxCategory, DEDUCTIBLE_CATEGORIES } from './dto';
import { paginate } from '../../common';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  // Expense methods
  async findAll(organizationId: string, filter: ExpenseFilterDto) {
    const { page = 1, limit = 20, categoryId, vendorId, startDate, endDate } = filter;
    const skip = (page - 1) * limit;

    const where: Prisma.ExpenseWhereInput = {
      organizationId,
      deletedAt: null,
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (vendorId) {
      where.vendorId = vendorId;
    }

    if (filter.taxCategory) {
      where.taxCategory = filter.taxCategory;
    }

    if (filter.isDeductible !== undefined) {
      where.isDeductible = filter.isDeductible;
    }

    if (startDate || endDate) {
      where.expenseDate = {};
      if (startDate) {
        where.expenseDate.gte = startDate;
      }
      if (endDate) {
        where.expenseDate.lte = endDate;
      }
    }

    const [expenses, total, aggregate] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        skip,
        take: limit,
        orderBy: { expenseDate: 'desc' },
        include: {
          category: {
            select: { id: true, name: true },
          },
          vendor: {
            select: { id: true, name: true },
          },
          recordedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);

    const result = paginate(expenses, total, page, limit);
    return { ...result, meta: { ...result.meta, totalAmount: Number(aggregate._sum.amount ?? 0) } };
  }

  async findOne(id: string, organizationId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        category: true,
        vendor: {
          select: { id: true, name: true },
        },
        recordedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    return expense;
  }

  async create(organizationId: string, userId: string, dto: CreateExpenseDto) {
    // Verify category if provided
    if (dto.categoryId) {
      const category = await this.prisma.expenseCategory.findFirst({
        where: { id: dto.categoryId, organizationId },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    // Verify vendor belongs to org if provided
    if (dto.vendorId) {
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: dto.vendorId, organizationId },
      });

      if (!vendor) {
        throw new NotFoundException('Vendor not found');
      }
    }

    const taxCategory = (dto.taxCategory ?? TaxCategory.UNCATEGORIZED) as TaxCategory;
    const isDeductible = DEDUCTIBLE_CATEGORIES.has(taxCategory);

    const expense = await this.prisma.expense.create({
      data: {
        organizationId,
        recordedById: userId,
        description: dto.description,
        amount: dto.amount,
        expenseDate: dto.expenseDate,
        categoryId: dto.categoryId,
        vendorId: dto.vendorId,
        recipient: dto.recipient,
        paymentMethod: dto.paymentMethod,
        reference: dto.reference,
        notes: dto.notes,
        taxCategory,
        isDeductible,
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
        vendor: {
          select: { id: true, name: true },
        },
      },
    });

    return expense;
  }

  async update(id: string, organizationId: string, dto: UpdateExpenseDto) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    // Verify category if being updated
    if (dto.categoryId) {
      const category = await this.prisma.expenseCategory.findFirst({
        where: { id: dto.categoryId, organizationId },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    // Verify vendor belongs to org if provided
    if (dto.vendorId) {
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: dto.vendorId, organizationId },
      });

      if (!vendor) {
        throw new NotFoundException('Vendor not found');
      }
    }

    const updateData: any = { ...dto };
    if (dto.taxCategory !== undefined) {
      updateData.isDeductible = DEDUCTIBLE_CATEGORIES.has(dto.taxCategory as TaxCategory);
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: updateData,
      include: {
        category: {
          select: { id: true, name: true },
        },
        vendor: {
          select: { id: true, name: true },
        },
      },
    });

    return updated;
  }

  async remove(id: string, organizationId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    // Soft delete
    await this.prisma.expense.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Expense deleted successfully' };
  }

  async bulkRecategorize(organizationId: string, dto: BulkRecategorizeDto) {
    const taxCategory = dto.taxCategory as TaxCategory;
    const isDeductible = DEDUCTIBLE_CATEGORIES.has(taxCategory);

    const result = await this.prisma.expense.updateMany({
      where: {
        id: { in: dto.ids },
        organizationId,
        deletedAt: null,
      },
      data: { taxCategory, isDeductible },
    });

    return { updated: result.count };
  }

  // Category methods
  async findAllCategories(organizationId: string) {
    return this.prisma.expenseCategory.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(organizationId: string, dto: CreateExpenseCategoryDto) {
    // Check for duplicate name
    const existing = await this.prisma.expenseCategory.findFirst({
      where: { organizationId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Category with this name already exists');
    }

    return this.prisma.expenseCategory.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async updateCategory(id: string, organizationId: string, dto: CreateExpenseCategoryDto) {
    const category = await this.prisma.expenseCategory.findFirst({
      where: { id, organizationId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Check for duplicate name (excluding current category)
    if (dto.name !== category.name) {
      const existing = await this.prisma.expenseCategory.findFirst({
        where: { organizationId, name: dto.name, id: { not: id } },
      });

      if (existing) {
        throw new ConflictException('Category with this name already exists');
      }
    }

    return this.prisma.expenseCategory.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async removeCategory(id: string, organizationId: string) {
    const category = await this.prisma.expenseCategory.findFirst({
      where: { id, organizationId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Soft delete by deactivating
    await this.prisma.expenseCategory.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Category deactivated successfully' };
  }
}
