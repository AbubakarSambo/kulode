import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InvoiceCollectionsService } from './invoice-collections.service';
import { InvoiceCollectionsSummaryService } from './invoice-collections.summary';

@Injectable()
export class InvoiceCollectionsCron {
  private readonly logger = new Logger(InvoiceCollectionsCron.name);
  private running = false;

  constructor(
    private readonly collections: InvoiceCollectionsService,
    private readonly summary: InvoiceCollectionsSummaryService,
  ) {}

  // Off unless INVOICE_COLLECTIONS_ENABLED=true, so deploying this to an environment sends nothing
  // by itself. Planning is idempotent (unique invoice + step), so an overlapping or repeated run is harmless.
  @Cron('*/15 * * * *')
  async tick() {
    if (process.env.INVOICE_COLLECTIONS_ENABLED !== 'true' || this.running) return;
    this.running = true;
    try {
      const enrolled = await this.collections.enrollEligibleInvoices();
      const processed = await this.collections.processDue();
      if (enrolled > 0 || processed > 0) {
        this.logger.log(`Invoice collections tick: enrolled ${enrolled}, processed ${processed}`);
      }
    } catch (error) {
      this.logger.error(`Invoice collections tick failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  // Monday 07:00 UTC, 08:00 in Lagos. Same switch as the reminders.
  @Cron('0 7 * * 1')
  async weeklySummary() {
    if (process.env.INVOICE_COLLECTIONS_ENABLED !== 'true') return;
    try {
      const messaged = await this.summary.sendWeeklySummaries();
      if (messaged > 0) this.logger.log(`Invoice collections weekly summary sent to ${messaged} business(es)`);
    } catch (error) {
      this.logger.error(`Invoice collections weekly summary failed: ${(error as Error).message}`);
    }
  }
}
