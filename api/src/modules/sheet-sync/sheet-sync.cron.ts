import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SheetSyncService } from './sheet-sync.service';

const FLUSH_INTERVAL_MS = 15_000;

@Injectable()
export class SheetSyncCron {
  private readonly logger = new Logger(SheetSyncCron.name);
  private hasLoggedPaused = false;

  constructor(private readonly sheetSyncService: SheetSyncService) {}

  @Interval(FLUSH_INTERVAL_MS)
  async handleFlush() {
    // Paused 2026-10-06 — this flush's query (sheet_sync_queue.findMany with no organizationId
    // filter, not covered by the existing (organizationId, syncedAt) index) was identified via
    // Sentry traces as a likely contributor to periodic p95/p99 latency spikes on unrelated hot
    // endpoints (e.g. GET /orders), by running globally across all orgs every 15s regardless of
    // whether any org has anything pending. Gated behind an env var rather than removed outright
    // so it's a one-line revert (set SHEET_SYNC_ENABLED=true) once the query itself is properly
    // indexed/scoped, with no code change needed either way. Rows keep queuing via enqueue/
    // enqueueMany in the meantime (orders.service.ts / wallet.service.ts) — nothing is lost, they
    // just sit unsynced until this is turned back on.
    if (process.env.SHEET_SYNC_ENABLED !== 'true') {
      if (!this.hasLoggedPaused) {
        this.logger.warn('Sheet sync flush is paused (set SHEET_SYNC_ENABLED=true to resume) — queued rows are accumulating unsynced');
        this.hasLoggedPaused = true;
      }
      return;
    }
    try {
      await this.sheetSyncService.flush();
    } catch (error) {
      this.logger.error(`Unexpected error during sheet sync flush: ${error}`);
    }
  }
}
