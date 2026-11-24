import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaystackService } from './paystack.service';

@Injectable()
export class PaystackReconcileCron {
  private readonly logger = new Logger(PaystackReconcileCron.name);
  private running = false;

  constructor(private readonly paystack: PaystackService) {}

  // Hourly. Read-only against Paystack, and reconciliation is idempotent on the payment reference, so
  // an overlapping or repeated run is harmless. Set PAYSTACK_RECONCILE_ENABLED=false to switch it off.
  @Cron('17 * * * *')
  async tick() {
    if (process.env.PAYSTACK_RECONCILE_ENABLED === 'false' || this.running) return;
    this.running = true;
    try {
      const { checked, recovered } = await this.paystack.reconcilePendingPayments();
      if (recovered > 0) this.logger.warn(`Paystack reconciliation: checked ${checked}, recovered ${recovered} missed payment(s)`);
    } catch (error) {
      this.logger.error(`Paystack reconciliation failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
