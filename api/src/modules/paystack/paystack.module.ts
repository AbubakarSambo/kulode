import { Module, forwardRef } from '@nestjs/common';
import { PaystackService } from './paystack.service';
import { PaystackController } from './paystack.controller';
import { SubscriptionModule } from '../subscription/subscription.module';
import { InventoryModule } from '../inventory/inventory.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [InventoryModule, WhatsappModule, forwardRef(() => SubscriptionModule)],
  controllers: [PaystackController],
  providers: [PaystackService],
  exports: [PaystackService],
})
export class PaystackModule {}
