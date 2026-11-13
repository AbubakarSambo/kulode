import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { LoyaltySender } from './loyalty.sender';
import { LoyaltyCron } from './loyalty.cron';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyReportsService } from './loyalty.reports.service';

@Module({
  imports: [CustomersModule, WhatsappModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, LoyaltyReportsService, LoyaltyCron, LoyaltySender],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
