import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { LoyaltyCron } from './loyalty.cron';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

@Module({
  imports: [CustomersModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, LoyaltyCron],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
