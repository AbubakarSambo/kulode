import { Module, forwardRef } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController, ServiceItemsController } from './invoices.controller';
import { InvoicePdfService } from './invoice-pdf.service';
import { PaystackModule } from '../paystack/paystack.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [forwardRef(() => PaystackModule), InventoryModule],
  controllers: [InvoicesController, ServiceItemsController],
  providers: [InvoicesService, InvoicePdfService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
