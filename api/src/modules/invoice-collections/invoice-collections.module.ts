import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { InvoiceCollectionsService } from './invoice-collections.service';
import { InvoiceCollectionsCron } from './invoice-collections.cron';

@Module({
  imports: [WhatsappModule],
  providers: [InvoiceCollectionsService, InvoiceCollectionsCron],
  exports: [InvoiceCollectionsService],
})
export class InvoiceCollectionsModule {}
