import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderReceiptPdfService } from './order-receipt-pdf.service';
import { PosDashboardService } from './pos-dashboard.service';
import { PosDashboardController } from './pos-dashboard.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { PaystackModule } from '../paystack/paystack.module';
import { WalletModule } from '../wallet/wallet.module';
import { SheetSyncModule } from '../sheet-sync';
import { PrintersModule } from '../printers';
import { OrderTypesModule } from '../order-types';
import { PaymentTypesModule } from '../payment-types';

@Module({
  imports: [
    InventoryModule,
    WalletModule,
    SheetSyncModule,
    PrintersModule,
    OrderTypesModule,
    PaymentTypesModule,
    forwardRef(() => PaystackModule),
  ],
  controllers: [OrdersController, PosDashboardController],
  providers: [OrdersService, OrderReceiptPdfService, PosDashboardService],
  exports: [OrdersService],
})
export class OrdersModule {}
