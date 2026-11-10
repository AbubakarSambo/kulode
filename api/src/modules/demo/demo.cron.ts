import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DemoLiveService } from './demo-live.service';
import { PharmacyLiveService } from './pharmacy-live.service';

// Runs only for org ids listed in DEMO_ORG_IDS (the restaurant and pharmacy demos share the list),
// and each live service additionally refuses any org that isn't its own demo slug flagged as a test
// account — two independent guards against ever writing fake orders into a real business. An id
// that belongs to the other demo is simply a no-op for a service.
@Injectable()
export class DemoCron {
  private readonly logger = new Logger(DemoCron.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly demoLiveService: DemoLiveService,
    private readonly pharmacyLiveService: PharmacyLiveService,
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
        await this.pharmacyLiveService.tick(orgId);
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
        await this.pharmacyLiveService.prune(orgId);
      } catch (err) {
        this.logger.error(`Demo prune failed for org ${orgId}: ${err.message}`);
      }
    }
  }
}
