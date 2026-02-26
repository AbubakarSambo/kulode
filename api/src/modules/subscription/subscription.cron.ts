import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionService } from './subscription.service';

@Injectable()
export class SubscriptionCron {
  private readonly logger = new Logger(SubscriptionCron.name);

  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiry() {
    this.logger.log('Running daily subscription expiry check...');
    await this.subscriptionService.checkAndExpireTrials();
    await this.subscriptionService.checkAndExpireSubscriptions();
    this.logger.log('Subscription expiry check complete.');
  }
}
