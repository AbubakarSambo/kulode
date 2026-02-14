import { Module, forwardRef } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController, ServiceItemsController } from './invoices.controller';
import { InvoicePdfService } from './invoice-pdf.service';
import { PaystackModule } from '../paystack/paystack.module';

@Module({
  imports: [forwardRef(() => PaystackModule)],
  controllers: [InvoicesController, ServiceItemsController],
  providers: [InvoicesService, InvoicePdfService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
