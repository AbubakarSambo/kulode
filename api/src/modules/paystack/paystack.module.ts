import { Module, forwardRef } from '@nestjs/common';
import { PaystackService } from './paystack.service';
import { PaystackController } from './paystack.controller';
import { PaystackReconcileCron } from './paystack-reconcile.cron';
import { SubscriptionModule } from '../subscription/subscription.module';
import { InventoryModule } from '../inventory/inventory.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [InventoryModule, WhatsappModule, forwardRef(() => SubscriptionModule)],
  controllers: [PaystackController],
  providers: [PaystackService, PaystackReconcileCron],
  exports: [PaystackService],
})
export class PaystackModule {}
