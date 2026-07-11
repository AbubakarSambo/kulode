import { Module, forwardRef } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController, ServiceItemsController } from './invoices.controller';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoiceRenderService } from './invoice-render.service';
import { InvoicesCron } from './invoices.cron';
import { PaystackModule } from '../paystack/paystack.module';
import { InventoryModule } from '../inventory/inventory.module';
import { EmailModule } from '../email/email.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [forwardRef(() => PaystackModule), InventoryModule, EmailModule, WhatsappModule],
  controllers: [InvoicesController, ServiceItemsController],
  providers: [InvoicesService, InvoicePdfService, InvoiceRenderService, InvoicesCron],
  exports: [InvoicesService],
})
export class InvoicesModule {}
