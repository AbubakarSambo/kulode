import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { TipsController } from './tips.controller';
import { TipsService } from './tips.service';

@Module({
  imports: [OrdersModule],
  controllers: [TipsController],
  providers: [TipsService],
})
export class TipsModule {}
