import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InvoiceCollectionsService } from './invoice-collections.service';

@Injectable()
export class InvoiceCollectionsCron {
  private readonly logger = new Logger(InvoiceCollectionsCron.name);
  private running = false;

  constructor(private readonly collections: InvoiceCollectionsService) {}

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
}
