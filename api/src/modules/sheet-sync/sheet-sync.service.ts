import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SheetSyncTab } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleSheetsService } from '../google-sheets';

const MAX_ATTEMPTS = 10;
const FLUSH_BATCH_SIZE = 500;

const TAB_HEADERS: Record<SheetSyncTab, string[]> = {
  ORDERS: ['Order ID', 'Closed At', 'Source', 'Table', 'Customer', 'Subtotal', 'Tax', 'Total', 'Payment Method'],
  PAYMENTS: ['Payment ID', 'Order ID', 'Date', 'Amount', 'Method', 'Recorded By', 'Reference'],
  WALLET_TRANSACTIONS: [
    'Transaction ID',
    'Date',
    'Customer',
    'Type',
    'Amount',
    'Balance Before',
    'Balance After',
    'Order ID',
    'Recorded By',
    'Notes',
  ],
};

@Injectable()
export class SheetSyncService {
  private readonly logger = new Logger(SheetSyncService.name);

  constructor(
    private prisma: PrismaService,
    private googleSheets: GoogleSheetsService,
  ) {}

  /**
   * Queues a row to sync to the org's Google Sheet, written inside the caller's transaction so
   * it's provably consistent with the business mutation it describes (order close, wallet
   * movement, etc.) — if the transaction rolls back, so does the queued row. A background flush
   * (see SheetSyncCron) picks these up on its own schedule, so this never blocks the request.
   */
  async enqueue(
    tx: Prisma.TransactionClient,
    organizationId: string,
    tab: SheetSyncTab,
    rowValues: (string | number)[],
  ) {
    await tx.sheetSyncQueueEntry.create({
      data: { organizationId, tab, rowValues },
    });
  }

  async flush() {
    const pending = await this.prisma.sheetSyncQueueEntry.findMany({
      where: {
        syncedAt: null,
        attempts: { lt: MAX_ATTEMPTS },
        organization: { googleSheetId: { not: null } },
      },
      orderBy: { createdAt: 'asc' },
      take: FLUSH_BATCH_SIZE,
      include: { organization: { select: { googleSheetId: true } } },
    });

    if (pending.length === 0) return;

    const groups = new Map<string, typeof pending>();
    for (const entry of pending) {
      const key = `${entry.organizationId}::${entry.tab}`;
      const group = groups.get(key);
      if (group) group.push(entry);
      else groups.set(key, [entry]);
    }

    for (const entries of groups.values()) {
      const { organizationId, tab } = entries[0];
      const spreadsheetId = entries[0].organization.googleSheetId as string;
      const ids = entries.map((e) => e.id);

      try {
        await this.googleSheets.ensureTabExists(spreadsheetId, tab, TAB_HEADERS[tab]);
        await this.googleSheets.appendRows(
          spreadsheetId,
          tab,
          entries.map((e) => e.rowValues as (string | number)[]),
        );
        await this.prisma.sheetSyncQueueEntry.updateMany({
          where: { id: { in: ids } },
          data: { syncedAt: new Date() },
        });
      } catch (error) {
        this.logger.warn(
          `Sheet sync failed for org ${organizationId} tab ${tab} (${ids.length} rows): ${error}`,
        );
        await this.prisma.sheetSyncQueueEntry.updateMany({
          where: { id: { in: ids } },
          data: { attempts: { increment: 1 }, lastError: String(error).slice(0, 500) },
        });
      }
    }
  }
}
