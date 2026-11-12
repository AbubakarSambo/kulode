import { Module } from '@nestjs/common';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { CollectionCron } from './collection.cron';

@Module({
  controllers: [CollectionController],
  providers: [CollectionService, CollectionCron],
})
export class CollectionModule {}
