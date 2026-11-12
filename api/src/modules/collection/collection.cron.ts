import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CollectionService } from './collection.service';

@Injectable()
export class CollectionCron {
  private readonly logger = new Logger(CollectionCron.name);

  constructor(private readonly collection: CollectionService) {}

  // Hourly, not nightly: "the day after the period ends" is the organization's local date, and
  // organizations sit in different timezones. Locking is idempotent, so a missed or repeated run is harmless.
  @Cron(CronExpression.EVERY_HOUR)
  async lockEndedPeriods() {
    try {
      const locked = await this.collection.lockDuePeriods();
      if (locked > 0) this.logger.log(`Locked ${locked} ended phone-collection period(s)`);
    } catch (err) {
      this.logger.error(`Locking ended collection periods failed: ${(err as Error).message}`);
    }
  }
}
