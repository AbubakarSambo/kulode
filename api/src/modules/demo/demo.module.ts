import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders';
import { WalletModule } from '../wallet/wallet.module';
import { DemoSeedService } from './demo-seed.service';
import { DemoLiveService } from './demo-live.service';
import { DemoController } from './demo.controller';
import { DemoCron } from './demo.cron';

@Module({
  imports: [OrdersModule, WalletModule],
  controllers: [DemoController],
  providers: [DemoSeedService, DemoLiveService, DemoCron],
})
export class DemoModule {}
