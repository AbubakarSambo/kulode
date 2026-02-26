import { Module, forwardRef } from '@nestjs/common';
import { PaystackService } from './paystack.service';
import { PaystackController } from './paystack.controller';
import { SubscriptionModule } from '../subscription/subscription.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule, forwardRef(() => SubscriptionModule)],
  controllers: [PaystackController],
  providers: [PaystackService],
  exports: [PaystackService],
})
export class PaystackModule {}
