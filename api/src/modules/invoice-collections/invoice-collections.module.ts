import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { InvoiceCollectionsService } from './invoice-collections.service';
import { InvoiceCollectionsSummaryService } from './invoice-collections.summary';
import { InvoiceCollectionsCron } from './invoice-collections.cron';
import { InvoiceCollectionsController } from './invoice-collections.controller';

@Module({
  imports: [WhatsappModule],
  controllers: [InvoiceCollectionsController],
  providers: [InvoiceCollectionsService, InvoiceCollectionsSummaryService, InvoiceCollectionsCron],
  exports: [InvoiceCollectionsService],
})
export class InvoiceCollectionsModule {}
