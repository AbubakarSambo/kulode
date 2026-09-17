import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { AccountingFeedGuard } from './accounting-feed.guard';

@Module({
  controllers: [FeedController],
  providers: [FeedService, AccountingFeedGuard],
})
export class FeedModule {}
