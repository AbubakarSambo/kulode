import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMenuCategoryDto,
  UpdateMenuCategoryDto,
  CreateMenuItemDto,
  UpdateMenuItemDto,
  SetMenuItemIngredientsDto,
} from './dto';

const ingredientsInclude = {
  ingredients: {
    include: { inventoryItem: { select: { id: true, name: true, sku: true, unitOfMeasure: true } } },
  },
} as const;

@Injectable()
export class MenuService {
  constructor(private prisma: PrismaService) {}

  // ─── Categories ───────────────────────────────────────────────────────────

  async findAllCategories(organizationId: string) {
    return this.prisma.menuCategory.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createCategory(organizationId: string, dto: CreateMenuCategoryDto) {
    const existing = await this.prisma.menuCategory.findUnique({
      where: { organizationId_name: { organizationId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException('A menu category with this name already exists');
    }

    return this.prisma.menuCategory.create({
      data: {
        organizationId,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
        kind: dto.kind,
      },
    });
  }

  async updateCategory(organizationId: string, id: string, dto: UpdateMenuCategoryDto) {
    const category = await this.prisma.menuCategory.findFirst({ where: { id, organizationId } });
    if (!category) throw new NotFoundException('Menu category not found');

    if (dto.name && dto.name !== category.name) {
      const existing = await this.prisma.menuCategory.findUnique({
        where: { organizationId_name: { organizationId, name: dto.name } },
      });
      if (existing) {
        throw new ConflictException('A menu category with this name already exists');
      }
    }

    return this.prisma.menuCategory.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.kind !== undefined && { kind: dto.kind }),
      },
    });
  }

  async removeCategory(organizationId: string, id: string) {
    const category = await this.prisma.menuCategory.findFirst({ where: { id, organizationId } });
    if (!category) throw new NotFoundException('Menu category not found');

    await this.prisma.menuCategory.update({ where: { id }, data: { isActive: false } });
    return { message: 'Menu category deleted successfully' };
  }

  // ─── Items ────────────────────────────────────────────────────────────────

  async findAllItems(organizationId: string, categoryId?: string) {
    const items = await this.prisma.menuItem.findMany({
      where: { organizationId, ...(categoryId && { categories: { some: { categoryId } } }) },
      orderBy: { name: 'asc' },
      include: {
        categories: { include: { category: { select: { id: true, name: true } } } },
        ...ingredientsInclude,
      },
    });
    return items.map((item) => this.flattenIngredients(this.flattenCategories(item)));
  }

  async findOneItem(organizationId: string, id: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id, organizationId },
      include: {
        categories: { include: { category: { select: { id: true, name: true } } } },
        ...ingredientsInclude,
      },
    });
    if (!item) throw new NotFoundException('Menu item not found');
    return this.flattenIngredients(this.flattenCategories(item));
  }

  async getItemHistory(organizationId: string, id: string) {
    const item = await this.prisma.menuItem.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Menu item not found');

    const [recentOrders, stats] = await Promise.all([
      this.prisma.orderItem.findMany({
        where: { menuItemId: id, order: { organizationId } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          amount: true,
          createdAt: true,
          order: {
            select: {
              id: true,
              status: true,
              source: true,
              createdAt: true,
              waiter: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.prisma.orderItem.aggregate({
        where: { menuItemId: id, order: { organizationId, status: 'CLOSED_PAID' } },
        _count: true,
        _sum: { quantity: true, amount: true },
      }),
    ]);

    return {
      itemId: id,
      recentOrders,
      stats: {
        timesOrdered: stats._count,
        totalQuantitySold: stats._sum.quantity ?? 0,
        totalRevenue: stats._sum.amount ?? 0,
        lastOrderedAt: recentOrders[0]?.createdAt ?? null,
      },
    };
  }

  private flattenCategories<T extends { categories: { category: { id: string; name: string } }[] }>(
    item: T,
  ) {
    const { categories, ...rest } = item;
    return { ...rest, categories: categories.map((c) => c.category) };
  }

  private flattenIngredients<
    T extends {
      ingredients: {
        quantityPerUnit: unknown;
        inventoryItem: { id: string; name: string; sku: string | null; unitOfMeasure: string };
      }[];
    },
  >(item: T) {
    const { ingredients, ...rest } = item;
    return {
      ...rest,
      ingredients: ingredients.map((line) => ({
        inventoryItemId: line.inventoryItem.id,
        name: line.inventoryItem.name,
        sku: line.inventoryItem.sku,
        unitOfMeasure: line.inventoryItem.unitOfMeasure,
        quantityPerUnit: Number(line.quantityPerUnit),
      })),
    };
  }

  private async validateCategoryIds(organizationId: string, categoryIds: string[]) {
    if (categoryIds.length === 0) return;
    const count = await this.prisma.menuCategory.count({
      where: { id: { in: categoryIds }, organizationId },
    });
    if (count !== new Set(categoryIds).size) {
      throw new NotFoundException('One or more menu categories not found');
    }
  }

  // Replaces a menu item's full recipe. Same delete-all-then-recreate shape as categories, but
  // as its own endpoint (not folded into create/update item) since a recipe carries per-line data
  // (quantityPerUnit) and needs its inventory item ids validated against the org.
  async setIngredients(organizationId: string, menuItemId: string, dto: SetMenuItemIngredientsDto) {
    const item = await this.prisma.menuItem.findFirst({ where: { id: menuItemId, organizationId } });
    if (!item) throw new NotFoundException('Menu item not found');

    const inventoryItemIds = dto.ingredients.map((line) => line.inventoryItemId);
    if (inventoryItemIds.length > 0) {
      const count = await this.prisma.inventoryItem.count({
        where: { id: { in: inventoryItemIds }, organizationId, isActive: true },
      });
      if (count !== new Set(inventoryItemIds).size) {
        throw new NotFoundException('One or more inventory items not found');
      }
    }

    const updated = await this.prisma.menuItem.update({
      where: { id: menuItemId },
      data: {
        ingredients: {
          deleteMany: {},
          create: dto.ingredients.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            quantityPerUnit: line.quantityPerUnit,
          })),
        },
      },
      include: {
        categories: { include: { category: { select: { id: true, name: true } } } },
        ...ingredientsInclude,
      },
    });
    return this.flattenIngredients(this.flattenCategories(updated));
  }

  async createItem(organizationId: string, dto: CreateMenuItemDto) {
    const existing = await this.prisma.menuItem.findUnique({
      where: { organizationId_name: { organizationId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException('A menu item with this name already exists');
    }

    const categoryIds = dto.categoryIds ?? [];
    await this.validateCategoryIds(organizationId, categoryIds);

    const item = await this.prisma.menuItem.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        inventoryItemId: dto.inventoryItemId,
        imageUrl: dto.imageUrl,
        durationMinutes: dto.durationMinutes,
        categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
      },
      include: {
        categories: { include: { category: { select: { id: true, name: true } } } },
        ...ingredientsInclude,
      },
    });
    return this.flattenIngredients(this.flattenCategories(item));
  }

  async updateItem(organizationId: string, id: string, dto: UpdateMenuItemDto) {
    const item = await this.prisma.menuItem.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Menu item not found');

    if (dto.name && dto.name !== item.name) {
      const existing = await this.prisma.menuItem.findUnique({
        where: { organizationId_name: { organizationId, name: dto.name } },
      });
      if (existing) {
        throw new ConflictException('A menu item with this name already exists');
      }
    }

    if (dto.categoryIds !== undefined) {
      await this.validateCategoryIds(organizationId, dto.categoryIds);
    }

    const updated = await this.prisma.menuItem.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.inventoryItemId !== undefined && { inventoryItemId: dto.inventoryItemId }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.isAvailable !== undefined && { isAvailable: dto.isAvailable }),
        ...(dto.durationMinutes !== undefined && { durationMinutes: dto.durationMinutes }),
        ...(dto.categoryIds !== undefined && {
          categories: {
            deleteMany: {},
            create: dto.categoryIds.map((categoryId) => ({ categoryId })),
          },
        }),
      },
      include: {
        categories: { include: { category: { select: { id: true, name: true } } } },
        ...ingredientsInclude,
      },
    });
    return this.flattenIngredients(this.flattenCategories(updated));
  }

  async removeItem(organizationId: string, id: string) {
    const item = await this.prisma.menuItem.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Menu item not found');

    // OrderItem.menuItemId is nullable with onDelete: SetNull, and OrderItem.itemName is a
    // point-in-time snapshot, so order history/receipts survive this even once menuItem is gone.
    await this.prisma.menuItem.delete({ where: { id } });
    return { message: 'Menu item deleted successfully' };
  }
}
