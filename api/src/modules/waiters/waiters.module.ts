import { Module } from '@nestjs/common';
import { WaitersService } from './waiters.service';
import { WaitersController } from './waiters.controller';

@Module({
  controllers: [WaitersController],
  providers: [WaitersService],
  exports: [WaitersService],
})
export class WaitersModule {}
