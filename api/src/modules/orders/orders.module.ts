import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderReceiptPdfService } from './order-receipt-pdf.service';
import { InventoryModule } from '../inventory/inventory.module';
import { PaystackModule } from '../paystack/paystack.module';
import { WalletModule } from '../wallet/wallet.module';
import { SheetSyncModule } from '../sheet-sync';

@Module({
  imports: [InventoryModule, WalletModule, SheetSyncModule, forwardRef(() => PaystackModule)],
  controllers: [OrdersController],
  providers: [OrdersService, OrderReceiptPdfService],
  exports: [OrdersService],
})
export class OrdersModule {}
