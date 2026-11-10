import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AGENT_ONLINE_WINDOW_MS } from './print-agent.guard';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePrinterDto, UpdatePrinterDto, SetPrinterCategoriesDto } from './dto';

const PAIRING_CODE_TTL_MS = 15 * 60 * 1000;
// No 0/O, 1/I/L — the code is read off one screen and typed into another.
const PAIRING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PAIRING_CODE_LENGTH = 8;

function generatePairingCode(): string {
  const bytes = randomBytes(PAIRING_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) code += PAIRING_ALPHABET[bytes[i] % PAIRING_ALPHABET.length];
  return code;
}

/** Shown as XXXX-XXXX; the dash, spaces and letter case are ignored when it's typed back. */
function formatPairingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function normalizePairingCode(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

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
      select: { printAgentToken: true, printAgentLastSeenAt: true },
    });
    const lastSeenAt = organization.printAgentLastSeenAt;
    return {
      hasToken: !!organization.printAgentToken,
      lastSeenAt,
      online: !!lastSeenAt && Date.now() - lastSeenAt.getTime() < AGENT_ONLINE_WINDOW_MS,
    };
  }

  // A code the admin types into the print agent installer. Short-lived and single-use; asking
  // for a new one replaces any code still outstanding.
  async createPairingCode(organizationId: string): Promise<{ code: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
    // A collision with another org's live code is vanishingly unlikely, but the column is
    // unique, so retry rather than fail.
    for (let attempt = 0; ; attempt++) {
      const code = generatePairingCode();
      try {
        await this.prisma.organization.update({
          where: { id: organizationId },
          data: { printAgentPairingCode: code, printAgentPairingExpiresAt: expiresAt },
        });
        return { code: formatPairingCode(code), expiresAt };
      } catch (err) {
        if (attempt >= 3 || (err as { code?: string }).code !== 'P2002') throw err;
      }
    }
  }

  // Called by the agent itself (no user session). Hands back the org's existing token when it
  // has one — a second PC pairing, or a reinstall, must not disconnect agents already running.
  async redeemPairingCode(rawCode: string): Promise<{ token: string; organizationName: string }> {
    const code = normalizePairingCode(rawCode);
    const organization = code
      ? await this.prisma.organization.findFirst({
          where: { printAgentPairingCode: code, printAgentPairingExpiresAt: { gt: new Date() } },
          select: { id: true, name: true, printAgentToken: true },
        })
      : null;
    if (!organization) {
      throw new NotFoundException('That pairing code is not valid or has expired. Get a new one from Settings > Printers.');
    }

    const token = organization.printAgentToken ?? randomBytes(32).toString('hex');
    await this.prisma.organization.update({
      where: { id: organization.id },
      data: { printAgentToken: token, printAgentPairingCode: null, printAgentPairingExpiresAt: null },
    });
    return { token, organizationName: organization.name };
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
