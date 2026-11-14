import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders';
import { WalletModule } from '../wallet/wallet.module';
import { DemoSeedService } from './demo-seed.service';
import { DemoLiveService } from './demo-live.service';
import { PharmacySeedService } from './pharmacy-seed.service';
import { PharmacyLiveService } from './pharmacy-live.service';
import { SupermarketSeedService } from './supermarket-seed.service';
import { SupermarketLiveService } from './supermarket-live.service';
import { DemoController } from './demo.controller';
import { PharmacyDemoController } from './pharmacy.controller';
import { SupermarketDemoController } from './supermarket.controller';
import { DemoCron } from './demo.cron';

@Module({
  imports: [OrdersModule, WalletModule],
  controllers: [DemoController, PharmacyDemoController, SupermarketDemoController],
  providers: [
    DemoSeedService,
    DemoLiveService,
    PharmacySeedService,
    PharmacyLiveService,
    SupermarketSeedService,
    SupermarketLiveService,
    DemoCron,
  ],
})
export class DemoModule {}
