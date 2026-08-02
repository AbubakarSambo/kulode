import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SheetSyncService } from './sheet-sync.service';

const FLUSH_INTERVAL_MS = 15_000;

@Injectable()
export class SheetSyncCron {
  private readonly logger = new Logger(SheetSyncCron.name);

  constructor(private readonly sheetSyncService: SheetSyncService) {}

  @Interval(FLUSH_INTERVAL_MS)
  async handleFlush() {
    try {
      await this.sheetSyncService.flush();
    } catch (error) {
      this.logger.error(`Unexpected error during sheet sync flush: ${error}`);
    }
  }
}
