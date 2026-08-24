import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface DocketOrderContext {
  id: string;
  tableName?: string | null;
  waiterName?: string | null;
  source: string;
}

export interface DocketItem {
  id: string;
  menuItemId?: string | null;
  itemName: string;
  quantity: number;
  notes?: string | null;
}

const ESC = '\x1b';
const GS = '\x1d';
const INIT = `${ESC}@`; // reset printer state
const BOLD_ON = `${ESC}E\x01`;
const BOLD_OFF = `${ESC}E\x00`;
const DOUBLE_HEIGHT_ON = `${GS}!\x01`;
const DOUBLE_HEIGHT_OFF = `${GS}!\x00`;
const CENTER = `${ESC}a\x01`;
const LEFT = `${ESC}a\x00`;
const CUT = `${GS}V\x00`;
const FEED_LINES = '\n\n\n';

// Stale-job cutoff: if a print agent has been offline long enough that a pending job is this
// old, it's no longer "immediate" — surface it as failed instead of silently printing a
// docket for an order from an hour ago once the agent reconnects.
const STALE_JOB_MS = 10 * 60 * 1000;

// Kulode's backend runs off-premise and has no route to a printer's private LAN IP (e.g.
// 192.168.1.50) — only something physically on that network can reach it. So instead of
// printing directly, this service just queues one PrintJob row per (order, printer) and a
// small on-premise print agent (see PrintAgentController) polls for pending jobs, does the
// actual local TCP socket write to the printer, and reports the result back.
@Injectable()
export class PrintingService {
  private readonly logger = new Logger(PrintingService.name);

  constructor(private prisma: PrismaService) {}

  async dispatchDocketsForNewItems(
    organizationId: string,
    order: DocketOrderContext,
    newItems: DocketItem[],
  ): Promise<void> {
    if (newItems.length === 0) return;

    const printers = await this.prisma.printer.findMany({
      where: { organizationId, isActive: true },
      include: { categories: { select: { categoryId: true } } },
    });
    if (printers.length === 0) return;

    const menuItemIds = [...new Set(newItems.map((i) => i.menuItemId).filter((id): id is string => !!id))];
    const menuItemCategories =
      menuItemIds.length > 0
        ? await this.prisma.menuItemCategory.findMany({
            where: { menuItemId: { in: menuItemIds } },
            select: { menuItemId: true, categoryId: true },
          })
        : [];
    const categoryIdsByMenuItem = new Map<string, Set<string>>();
    for (const mc of menuItemCategories) {
      const set = categoryIdsByMenuItem.get(mc.menuItemId) ?? new Set<string>();
      set.add(mc.categoryId);
      categoryIdsByMenuItem.set(mc.menuItemId, set);
    }

    await Promise.all(
      printers.map(async (printer) => {
        const items =
          printer.categories.length === 0
            ? newItems
            : newItems.filter((item) => {
                const categoryIds = item.menuItemId ? categoryIdsByMenuItem.get(item.menuItemId) : undefined;
                if (!categoryIds) return false;
                return printer.categories.some((c) => categoryIds.has(c.categoryId));
              });

        if (items.length === 0) return;

        const payload = {
          orderId: order.id,
          tableName: order.tableName ?? null,
          waiterName: order.waiterName ?? null,
          source: order.source,
          items: items.map((i) => ({ itemName: i.itemName, quantity: i.quantity, notes: i.notes ?? null })),
          station: printer.station,
          printedAt: new Date().toISOString(),
          escposText: this.formatDocketEscPos(printer.station, order, items),
        };

        await this.prisma.printJob.create({
          data: { orderId: order.id, printerId: printer.id, payload },
        });
      }),
    );
  }

  // Re-queues a previously failed job so the agent picks it up on its next poll — used by the
  // "reprint" action on the order screen.
  async retryJob(organizationId: string, jobId: string): Promise<void> {
    const job = await this.prisma.printJob.findFirst({ where: { id: jobId, printer: { organizationId } } });
    if (!job) return;

    await this.prisma.printJob.update({
      where: { id: job.id },
      data: { status: 'PENDING', error: null },
    });
  }

  // Called by the print agent's poll loop. Atomically claims pending jobs (flips them to
  // DISPATCHED) so two overlapping polls — or a slow one running long — never hand the same
  // job to the agent twice.
  async claimPendingJobs(organizationId: string) {
    const staleCutoff = new Date(Date.now() - STALE_JOB_MS);

    const jobs = await this.prisma.printJob.findMany({
      where: { status: 'PENDING', printer: { organizationId }, createdAt: { gte: staleCutoff } },
      include: {
        printer: {
          select: { id: true, name: true, station: true, connectionType: true, ipAddress: true, port: true, devicePath: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    // Anything past the cutoff that never got printed is dead — fail it out rather than
    // leaving it PENDING forever (which would otherwise print a very late, confusing docket
    // the moment an agent eventually reconnects).
    await this.prisma.printJob.updateMany({
      where: { status: 'PENDING', printer: { organizationId }, createdAt: { lt: staleCutoff } },
      data: { status: 'FAILED', error: 'No print agent picked up this job in time' },
    });

    if (jobs.length === 0) return [];

    await this.prisma.printJob.updateMany({
      where: { id: { in: jobs.map((j) => j.id) } },
      data: { status: 'DISPATCHED' },
    });

    return jobs.map((job) => ({
      id: job.id,
      printer: {
        id: job.printer.id,
        name: job.printer.name,
        station: job.printer.station,
        connectionType: job.printer.connectionType,
        ipAddress: job.printer.ipAddress,
        port: job.printer.port,
        devicePath: job.printer.devicePath,
      },
      escposText: (job.payload as { escposText?: string }).escposText ?? '',
    }));
  }

  async reportJobResult(organizationId: string, jobId: string, status: 'SENT' | 'FAILED', error?: string) {
    const job = await this.prisma.printJob.findFirst({ where: { id: jobId, printer: { organizationId } } });
    if (!job) return;

    await this.prisma.printJob.update({
      where: { id: job.id },
      data: {
        status,
        error: status === 'FAILED' ? (error ?? 'Unknown error') : null,
        printedAt: status === 'SENT' ? new Date() : job.printedAt,
        attempts: { increment: 1 },
      },
    });

    if (status === 'FAILED') {
      this.logger.warn(`Print agent reported failure for job ${jobId} (org ${organizationId}): ${error}`);
    }
  }

  private formatDocketEscPos(station: string, order: DocketOrderContext, items: DocketItem[]): string {
    const lines: string[] = [];

    lines.push(INIT);
    lines.push(CENTER, BOLD_ON, DOUBLE_HEIGHT_ON, `${station}\n`, DOUBLE_HEIGHT_OFF, BOLD_OFF);
    lines.push(LEFT);
    if (order.tableName) lines.push(`Table: ${order.tableName}\n`);
    if (order.waiterName) lines.push(`Waiter: ${order.waiterName}\n`);
    lines.push(`Order: ${order.id.slice(0, 8)}\n`);
    lines.push(`${new Date().toLocaleString()}\n`);
    lines.push('--------------------------------\n');

    for (const item of items) {
      lines.push(BOLD_ON, `${item.quantity} x ${item.itemName}\n`, BOLD_OFF);
      if (item.notes) lines.push(`  Note: ${item.notes}\n`);
    }

    lines.push('--------------------------------\n');
    lines.push(FEED_LINES);
    lines.push(CUT);

    return lines.join('');
  }
}
