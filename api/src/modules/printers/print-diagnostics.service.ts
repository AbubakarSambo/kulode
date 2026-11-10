import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrintersService } from './printers.service';
import { PrintingService } from './printing.service';

const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_JOBS = 50;
const RECENT_LOG_LINES = 300;

// Support tooling: lets a platform admin see why an organization's printing isn't working —
// and try a test print or a network search — without anyone on site doing anything.
@Injectable()
export class PrintDiagnosticsService {
  private readonly logger = new Logger(PrintDiagnosticsService.name);

  constructor(
    private prisma: PrismaService,
    private printersService: PrintersService,
    private printingService: PrintingService,
  ) {}

  // Called by the agent, about once a minute when it has something new to say.
  async recordAgentLogs(organizationId: string, lines: Array<{ at: string; message: string }>) {
    if (lines.length > 0) {
      await this.prisma.printAgentLog.createMany({
        data: lines.map((line) => ({ organizationId, loggedAt: new Date(line.at), message: line.message })),
      });
    }
    await this.prisma.printAgentLog.deleteMany({
      where: { organizationId, createdAt: { lt: new Date(Date.now() - LOG_RETENTION_MS) } },
    });
    return { received: lines.length };
  }

  async getDiagnostics(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, printAgentVersion: true, printAgentHostname: true },
    });
    if (!organization) throw new NotFoundException('Organization not found');

    const [agentStatus, discovery, printers, lastPrints, jobs, logs] = await Promise.all([
      this.printersService.getAgentStatus(organizationId),
      this.printersService.getDiscovery(organizationId),
      this.printersService.findAll(organizationId),
      this.prisma.printJob.groupBy({
        by: ['printerId'],
        where: { status: 'SENT', printer: { organizationId } },
        _max: { printedAt: true },
      }),
      this.prisma.printJob.findMany({
        where: { printer: { organizationId } },
        orderBy: { createdAt: 'desc' },
        take: RECENT_JOBS,
        select: {
          id: true,
          orderId: true,
          status: true,
          error: true,
          attempts: true,
          createdAt: true,
          printedAt: true,
          payload: true,
          printer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.printAgentLog.findMany({
        where: { organizationId },
        orderBy: [{ loggedAt: 'desc' }, { createdAt: 'desc' }],
        take: RECENT_LOG_LINES,
        select: { id: true, loggedAt: true, message: true },
      }),
    ]);

    const lastPrintedAt = new Map(lastPrints.map((row) => [row.printerId, row._max.printedAt]));

    return {
      organization: { id: organization.id, name: organization.name },
      agent: {
        ...agentStatus,
        version: organization.printAgentVersion,
        hostname: organization.printAgentHostname,
      },
      discovery,
      printers: printers.map((printer) => ({
        id: printer.id,
        name: printer.name,
        station: printer.station,
        connectionType: printer.connectionType,
        ipAddress: printer.ipAddress,
        port: printer.port,
        devicePath: printer.devicePath,
        macAddress: printer.macAddress,
        isActive: printer.isActive,
        routes: printer.categories.map((c) => c.category.name),
        lastPrintedAt: lastPrintedAt.get(printer.id) ?? null,
      })),
      jobs: jobs.map((job) => {
        const payload = (job.payload ?? {}) as { type?: string; tableName?: string | null };
        return {
          id: job.id,
          orderId: job.orderId,
          printerId: job.printer.id,
          printerName: job.printer.name,
          // NEW / CANCELLED docket, or TEST for a test page.
          type: payload.type ?? 'NEW',
          tableName: payload.tableName ?? null,
          status: job.status,
          error: job.error,
          attempts: job.attempts,
          createdAt: job.createdAt,
          printedAt: job.printedAt,
        };
      }),
      logs,
    };
  }

  // Paper comes out at the customer's location, so record who asked for it.
  async testPrint(organizationId: string, printerId: string, adminEmail: string) {
    const result = await this.printingService.queueTestPrint(organizationId, printerId);
    this.logger.log(`Platform admin ${adminEmail} sent a test print to printer ${printerId} (org ${organizationId})`);
    return result;
  }

  async requestScan(organizationId: string, adminEmail: string) {
    const result = await this.printersService.requestScan(organizationId);
    this.logger.log(`Platform admin ${adminEmail} requested a network scan (org ${organizationId})`);
    return result;
  }
}
