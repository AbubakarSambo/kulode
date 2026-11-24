import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { InvoiceCollectionsService } from './invoice-collections.service';
import { InvoiceCollectionsCron } from './invoice-collections.cron';
import { InvoiceCollectionsController } from './invoice-collections.controller';

@Module({
  imports: [WhatsappModule],
  controllers: [InvoiceCollectionsController],
  providers: [InvoiceCollectionsService, InvoiceCollectionsCron],
  exports: [InvoiceCollectionsService],
})
export class InvoiceCollectionsModule {}
