import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SheetSyncTab } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleSheetsService } from '../google-sheets';

const MAX_ATTEMPTS = 10;
const FLUSH_BATCH_SIZE = 500;

const TAB_HEADERS: Record<SheetSyncTab, string[]> = {
  ORDER_ITEMS: [
    'Date 1',
    'Date 2',
    'Time Placed',
    'Time Served',
    'UID 1',
    'Customer Name',
    'Product Name',
    'Product Quantity',
    'Menu Category',
    'Sales Area 1',
    'Sales Area 2',
    'Sale Amount',
    'Item Amount',
    'VAT',
    'ET',
    'SC 1',
    'Delivery',
    'Payment Method',
  ],
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

  /**
   * Same as {@link enqueue}, batched — one insert for all rows instead of one round trip per
   * row. Matters inside a caller's transaction (e.g. closing a multi-item order): each row used
   * to cost its own sequential await, which on a large order could tip the transaction past
   * Prisma's interactive-transaction timeout.
   */
  async enqueueMany(
    tx: Prisma.TransactionClient,
    organizationId: string,
    tab: SheetSyncTab,
    rows: (string | number)[][],
  ) {
    if (rows.length === 0) return;
    await tx.sheetSyncQueueEntry.createMany({
      data: rows.map((rowValues) => ({ organizationId, tab, rowValues })),
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
