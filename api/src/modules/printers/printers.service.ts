import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AGENT_ONLINE_WINDOW_MS, SCAN_REQUEST_TTL_MS } from './print-agent.guard';
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
  private readonly logger = new Logger(PrintersService.name);

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
        macAddress: dto.macAddress,
        printsBills: dto.printsBills,
        printsDockets: dto.printsDockets,
        paperWidthMm: dto.paperWidthMm,
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

    // A hand-typed IP points at whichever device the admin means now, so drop the hardware
    // address learned for the old one — otherwise the next scan would "correct" the IP back.
    // The next scan learns the new device's address.
    const ipChangedByHand =
      dto.ipAddress !== undefined && dto.ipAddress !== printer.ipAddress && dto.macAddress === undefined;

    return this.prisma.printer.update({
      where: { id },
      data: {
        ...(dto.macAddress !== undefined && { macAddress: dto.macAddress }),
        ...(ipChangedByHand && { macAddress: null }),
        ...(dto.name && { name: dto.name }),
        ...(dto.station && { station: dto.station }),
        ...(dto.connectionType && { connectionType: dto.connectionType }),
        ...(dto.ipAddress !== undefined && { ipAddress: dto.ipAddress }),
        ...(dto.port !== undefined && { port: dto.port }),
        ...(dto.devicePath !== undefined && { devicePath: dto.devicePath }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.printsBills !== undefined && { printsBills: dto.printsBills }),
        ...(dto.printsDockets !== undefined && { printsDockets: dto.printsDockets }),
        ...(dto.paperWidthMm !== undefined && { paperWidthMm: dto.paperWidthMm }),
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

  // ─── Printer discovery ──────────────────────────────────────────────────────

  // Flags the organization so the agent's next poll (within a couple of seconds) starts a scan.
  async requestScan(organizationId: string) {
    const requestedAt = new Date();
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { printAgentScanRequestedAt: requestedAt },
    });
    return { requestedAt };
  }

  // What the agent last found on the local network, each marked with the printer it already
  // belongs to (if any) so the settings page only offers to add the new ones.
  async getDiscovery(organizationId: string) {
    const [organization, printers] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { printAgentScanRequestedAt: true, printAgentDiscovered: true, printAgentDiscoveredAt: true },
      }),
      this.prisma.printer.findMany({
        where: { organizationId, isActive: true, connectionType: 'NETWORK' },
        select: { id: true, name: true, ipAddress: true, port: true, macAddress: true },
      }),
    ]);

    const requestedAt = organization.printAgentScanRequestedAt;
    const devices = ((organization.printAgentDiscovered as DiscoveredDevice[] | null) ?? []).map((device) => {
      const printer = printers.find((p) => matchesDevice(p, device));
      return { ...device, printerId: printer?.id ?? null, printerName: printer?.name ?? null };
    });
    return {
      scanning: !!requestedAt && Date.now() - requestedAt.getTime() < SCAN_REQUEST_TTL_MS,
      scannedAt: organization.printAgentDiscoveredAt,
      devices,
    };
  }

  // Called by the agent after every scan. Stores the results, and keeps saved printers pointing
  // at the right device: a printer whose hardware address shows up at a new IP has its IP
  // corrected, and a printer with no hardware address yet learns it from the device at its IP.
  async recordDiscovery(organizationId: string, devices: DiscoveredDevice[]) {
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        printAgentDiscovered: devices.map((d) => ({ ipAddress: d.ipAddress, port: d.port, macAddress: d.macAddress ?? null })),
        printAgentDiscoveredAt: new Date(),
        printAgentScanRequestedAt: null,
      },
    });

    const printers = await this.prisma.printer.findMany({
      where: { organizationId, isActive: true, connectionType: 'NETWORK' },
      select: { id: true, name: true, ipAddress: true, port: true, macAddress: true },
    });

    let corrected = 0;
    for (const printer of printers) {
      if (printer.macAddress) {
        // Two devices answering with one hardware address means something odd on the network
        // (or two ports on one device) — don't guess which is the printer.
        const sameMac = devices.filter((d) => d.macAddress === printer.macAddress);
        if (sameMac.length !== 1 || sameMac[0].ipAddress === printer.ipAddress) continue;
        await this.prisma.printer.update({ where: { id: printer.id }, data: { ipAddress: sameMac[0].ipAddress } });
        this.logger.log(
          `Printer "${printer.name}" (org ${organizationId}) moved from ${printer.ipAddress} to ${sameMac[0].ipAddress}; address corrected`,
        );
        corrected++;
      } else {
        const atSameAddress = devices.find(
          (d) => d.macAddress && d.ipAddress === printer.ipAddress && d.port === (printer.port ?? 9100),
        );
        if (!atSameAddress) continue;
        await this.prisma.printer.update({ where: { id: printer.id }, data: { macAddress: atSameAddress.macAddress } });
      }
    }
    return { received: devices.length, corrected };
  }
}

interface DiscoveredDevice {
  ipAddress: string;
  port: number;
  macAddress?: string | null;
}

function matchesDevice(
  printer: { ipAddress: string | null; port: number | null; macAddress: string | null },
  device: DiscoveredDevice,
): boolean {
  if (printer.macAddress && device.macAddress) return printer.macAddress === device.macAddress;
  return printer.ipAddress === device.ipAddress && (printer.port ?? 9100) === device.port;
}
