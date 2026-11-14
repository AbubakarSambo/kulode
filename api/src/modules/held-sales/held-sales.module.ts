import { Module } from '@nestjs/common';
import { HeldSalesService } from './held-sales.service';
import { HeldSalesController } from './held-sales.controller';

@Module({
  controllers: [HeldSalesController],
  providers: [HeldSalesService],
})
export class HeldSalesModule {}
