import { Controller, Get, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { SupermarketSeedService } from './supermarket-seed.service';
import { SupermarketLiveService } from './supermarket-live.service';

@ApiTags('Platform')
@ApiBearerAuth()
@Controller('platform/demo/supermarket')
@UseGuards(PlatformAdminGuard)
export class SupermarketDemoController {
  constructor(
    private readonly supermarketSeedService: SupermarketSeedService,
    private readonly supermarketLiveService: SupermarketLiveService,
  ) {}

  @Post('reset')
  @ApiOperation({ summary: 'Create or rebuild the sales-demo supermarket (wipes its POS data)' })
  async reset() {
    return this.supermarketSeedService.reset();
  }

  @Post('tick')
  @ApiOperation({ summary: 'Advance the demo supermarket to now (same as the 15-minute job)' })
  async tick() {
    const org = await this.supermarketSeedService.findDemoOrg();
    if (!org) throw new NotFoundException('Demo supermarket not created yet — call POST /platform/demo/supermarket/reset');
    await this.supermarketLiveService.tick(org.id);
    return { organizationId: org.id };
  }

  @Get('status')
  @ApiOperation({ summary: 'Demo supermarket id and whether a rebuild is running' })
  async status() {
    const org = await this.supermarketSeedService.findDemoOrg();
    return { organizationId: org?.id ?? null, rebuilding: this.supermarketSeedService.isPopulating() };
  }
}
