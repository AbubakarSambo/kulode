import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePrinterDto, UpdatePrinterDto, SetPrinterCategoriesDto } from './dto';

@Injectable()
export class PrintersService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.printer.findMany({
      where: { organizationId },
      include: { categories: { include: { category: { select: { id: true, name: true } } } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const printer = await this.prisma.printer.findFirst({
      where: { id, organizationId },
      include: { categories: { include: { category: { select: { id: true, name: true } } } } },
    });
    if (!printer) throw new NotFoundException('Printer not found');
    return printer;
  }

  async create(organizationId: string, dto: CreatePrinterDto) {
    const existing = await this.prisma.printer.findUnique({
      where: { organizationId_name: { organizationId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException('A printer with this name already exists');
    }

    return this.prisma.printer.create({
      data: {
        organizationId,
        name: dto.name,
        station: dto.station,
        connectionType: dto.connectionType,
        ipAddress: dto.ipAddress,
        port: dto.port,
        devicePath: dto.devicePath,
      },
    });
  }

  async update(organizationId: string, id: string, dto: UpdatePrinterDto) {
    const printer = await this.prisma.printer.findFirst({ where: { id, organizationId } });
    if (!printer) throw new NotFoundException('Printer not found');

    if (dto.name && dto.name !== printer.name) {
      const existing = await this.prisma.printer.findUnique({
        where: { organizationId_name: { organizationId, name: dto.name } },
      });
      if (existing) {
        throw new ConflictException('A printer with this name already exists');
      }
    }

    return this.prisma.printer.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.station && { station: dto.station }),
        ...(dto.connectionType && { connectionType: dto.connectionType }),
        ...(dto.ipAddress !== undefined && { ipAddress: dto.ipAddress }),
        ...(dto.port !== undefined && { port: dto.port }),
        ...(dto.devicePath !== undefined && { devicePath: dto.devicePath }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(organizationId: string, id: string) {
    const printer = await this.prisma.printer.findFirst({ where: { id, organizationId } });
    if (!printer) throw new NotFoundException('Printer not found');

    await this.prisma.printer.update({ where: { id }, data: { isActive: false } });
    return { message: 'Printer deleted successfully' };
  }

  // Replaces the printer's full category list. An empty list turns it back into a broadcast
  // printer (see PrintingService) that receives every order regardless of item category.
  async setCategories(organizationId: string, id: string, dto: SetPrinterCategoriesDto) {
    const printer = await this.prisma.printer.findFirst({ where: { id, organizationId } });
    if (!printer) throw new NotFoundException('Printer not found');

    if (dto.categoryIds.length > 0) {
      const count = await this.prisma.menuCategory.count({
        where: { id: { in: dto.categoryIds }, organizationId },
      });
      if (count !== dto.categoryIds.length) {
        throw new NotFoundException('One or more categories were not found');
      }
    }

    await this.prisma.$transaction([
      this.prisma.menuCategoryPrinter.deleteMany({ where: { printerId: id } }),
      this.prisma.menuCategoryPrinter.createMany({
        data: dto.categoryIds.map((categoryId) => ({ categoryId, printerId: id })),
      }),
    ]);

    return this.findOne(organizationId, id);
  }

  async getAgentStatus(organizationId: string) {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { printAgentToken: true },
    });
    return { hasToken: !!organization.printAgentToken };
  }

  // Returns the plaintext token exactly once — the caller (settings UI) must show/copy it
  // immediately, since it isn't returned again after this. Rotating invalidates whatever agent
  // instance is running with the old value until it's reconfigured with the new one.
  async rotateAgentToken(organizationId: string): Promise<{ token: string }> {
    const token = randomBytes(32).toString('hex');
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { printAgentToken: token },
    });
    return { token };
  }
}
