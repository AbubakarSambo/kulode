import { Module } from '@nestjs/common';
import { MoniepointService } from './moniepoint.service';
import { MoniepointController } from './moniepoint.controller';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [MoniepointController],
  providers: [MoniepointService],
  exports: [MoniepointService],
})
export class MoniepointModule {}
