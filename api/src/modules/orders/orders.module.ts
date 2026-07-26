import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderReceiptPdfService } from './order-receipt-pdf.service';
import { InventoryModule } from '../inventory/inventory.module';
import { PaystackModule } from '../paystack/paystack.module';

@Module({
  imports: [InventoryModule, forwardRef(() => PaystackModule)],
  controllers: [OrdersController],
  providers: [OrdersService, OrderReceiptPdfService],
  exports: [OrdersService],
})
export class OrdersModule {}
