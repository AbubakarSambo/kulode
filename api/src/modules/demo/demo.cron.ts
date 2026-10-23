import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DemoLiveService } from './demo-live.service';

// Runs only for org ids listed in DEMO_ORG_IDS, and DemoLiveService additionally refuses any org
// that isn't the demo slug flagged as a test account — two independent guards against ever
// writing fake orders into a real restaurant.
@Injectable()
export class DemoCron {
  private readonly logger = new Logger(DemoCron.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly demoLiveService: DemoLiveService,
  ) {}

  private orgIds(): string[] {
    return (this.configService.get<string>('demo.orgIds') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  @Cron('*/15 * * * *')
  async tick() {
    for (const orgId of this.orgIds()) {
      try {
        await this.demoLiveService.tick(orgId);
      } catch (err) {
        this.logger.error(`Demo tick failed for org ${orgId}: ${err.message}`);
      }
    }
  }

  @Cron('30 3 * * *', { timeZone: 'Africa/Lagos' })
  async prune() {
    for (const orgId of this.orgIds()) {
      try {
        await this.demoLiveService.prune(orgId);
      } catch (err) {
        this.logger.error(`Demo prune failed for org ${orgId}: ${err.message}`);
      }
    }
  }
}
