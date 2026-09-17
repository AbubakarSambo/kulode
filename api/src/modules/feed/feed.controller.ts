import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common';
import { AccountingFeedGuard } from './accounting-feed.guard';
import { FeedService } from './feed.service';

// Public, read-only feed for external accounting tools (currently: C.R.E.A.M.) to pull
// restaurant sales from. Authenticated with a shared bearer secret (AccountingFeedGuard), not a
// user JWT — see that guard for why. Excluded from Swagger since it's not part of the app's own
// authenticated API surface.
@ApiExcludeController()
@Public()
@UseGuards(AccountingFeedGuard)
@Controller('public/feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get('sales')
  getSales() {
    return this.feedService.getSales();
  }
}
