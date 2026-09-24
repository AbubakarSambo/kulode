import { Module } from '@nestjs/common';
import { SalesSummaryCron } from './sales-summary.cron';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [WhatsappModule, OrdersModule],
  providers: [SalesSummaryCron],
})
export class SalesSummaryModule {}
