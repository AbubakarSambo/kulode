import { Module, forwardRef } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionCron } from './subscription.cron';
import { PaystackModule } from '../paystack/paystack.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [forwardRef(() => PaystackModule), EmailModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, SubscriptionCron],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
