import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { creditOrderSpend } from './loyalty.earn';

const CATCH_UP_BATCH = 500;

@Injectable()
export class LoyaltyCron {
  private readonly logger = new Logger(LoyaltyCron.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Payments credit loyalty right after they commit; if that step failed or the process died in
   * between, this finds the paid orders of enrolled members that have no ledger entry and credits
   * them. Crediting is idempotent, so a repeat run (or racing a live payment) is harmless.
   * Starts from the organizations that have loyalty on, so it stays cheap as tenants are added.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async creditMissedOrders() {
    try {
      const missed = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT o.id
        FROM organizations org
        JOIN orders o ON o.organization_id = org.id
        JOIN customers c ON c.id = o.customer_id AND c.is_member
        WHERE org.loyalty_enabled
          AND o.status = 'CLOSED_PAID'
          AND o.created_at >= now() - interval '7 days'
          AND o.closed_at >= now() - interval '48 hours'
          AND o.closed_at >= org.loyalty_start_at
          AND (c.enrolled_at IS NULL OR o.closed_at >= c.enrolled_at)
          AND NOT EXISTS (
            SELECT 1 FROM loyalty_ledger l
            WHERE l.order_id = o.id AND l.customer_id = o.customer_id AND l.entry_type = 'SPEND'
          )
          AND NOT EXISTS (
            SELECT 1 FROM loyalty_ledger l
            WHERE l.order_id = o.id AND l.customer_id = o.customer_id AND l.entry_type = 'REVERSAL'
          )
        LIMIT ${CATCH_UP_BATCH}
      `;
      let credited = 0;
      for (const { id } of missed) {
        try {
          if (await creditOrderSpend(this.prisma, id)) credited++;
        } catch (err) {
          this.logger.error(`Catch-up credit failed for order ${id}: ${(err as Error).message}`);
        }
      }
      if (credited > 0) this.logger.log(`Loyalty catch-up credited ${credited} order(s)`);
    } catch (err) {
      this.logger.error(`Loyalty catch-up failed: ${(err as Error).message}`);
    }
  }
}
