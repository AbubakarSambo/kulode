import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma';

// Idempotency keys only need to survive long enough to catch a genuine retry of the same
// action (an offline-queue flush, a double-tapped button) — 30 days is generous cover for that
// while keeping the table from growing forever and slowing down the shared idempotency-check
// transaction (runIdempotent) that gates most POS mutations.
const IDEMPOTENCY_KEY_RETENTION_DAYS = 30;

@Injectable()
export class MaintenanceCron {
  private readonly logger = new Logger(MaintenanceCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupIdempotencyKeys() {
    const cutoff = new Date(Date.now() - IDEMPOTENCY_KEY_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    try {
      const result = await this.prisma.idempotencyKey.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        this.logger.log(`Deleted ${result.count} idempotency key(s) older than ${IDEMPOTENCY_KEY_RETENTION_DAYS} days`);
      }
    } catch (err) {
      this.logger.error(`Idempotency key cleanup failed: ${err.message}`);
    }
  }
}
