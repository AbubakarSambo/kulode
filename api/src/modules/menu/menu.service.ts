import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMenuCategoryDto,
  UpdateMenuCategoryDto,
  CreateMenuItemDto,
  UpdateMenuItemDto,
} from './dto';

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
    return this.prisma.menuItem.findMany({
      where: { organizationId, ...(categoryId && { categoryId }) },
      orderBy: { name: 'asc' },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  async findOneItem(organizationId: string, id: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id, organizationId },
      include: { category: { select: { id: true, name: true } } },
    });
    if (!item) throw new NotFoundException('Menu item not found');
    return item;
  }

  async createItem(organizationId: string, dto: CreateMenuItemDto) {
    const existing = await this.prisma.menuItem.findUnique({
      where: { organizationId_name: { organizationId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException('A menu item with this name already exists');
    }

    if (dto.categoryId) {
      const category = await this.prisma.menuCategory.findFirst({
        where: { id: dto.categoryId, organizationId },
      });
      if (!category) throw new NotFoundException('Menu category not found');
    }

    return this.prisma.menuItem.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        categoryId: dto.categoryId,
        inventoryItemId: dto.inventoryItemId,
        imageUrl: dto.imageUrl,
      },
    });
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

    if (dto.categoryId) {
      const category = await this.prisma.menuCategory.findFirst({
        where: { id: dto.categoryId, organizationId },
      });
      if (!category) throw new NotFoundException('Menu category not found');
    }

    return this.prisma.menuItem.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.inventoryItemId !== undefined && { inventoryItemId: dto.inventoryItemId }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.isAvailable !== undefined && { isAvailable: dto.isAvailable }),
      },
    });
  }

  async removeItem(organizationId: string, id: string) {
    const item = await this.prisma.menuItem.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Menu item not found');

    await this.prisma.menuItem.delete({ where: { id } });
    return { message: 'Menu item deleted successfully' };
  }
}
