import { Controller, Get, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { DemoSeedService } from './demo-seed.service';
import { DemoLiveService } from './demo-live.service';

@ApiTags('Platform')
@ApiBearerAuth()
@Controller('platform/demo')
@UseGuards(PlatformAdminGuard)
export class DemoController {
  constructor(
    private readonly demoSeedService: DemoSeedService,
    private readonly demoLiveService: DemoLiveService,
  ) {}

  @Post('reset')
  @ApiOperation({ summary: 'Create or rebuild the sales-demo restaurant (wipes its POS data)' })
  async reset() {
    return this.demoSeedService.reset();
  }

  @Post('tick')
  @ApiOperation({ summary: 'Advance the demo restaurant to now (same as the 15-minute job)' })
  async tick() {
    const org = await this.demoSeedService.findDemoOrg();
    if (!org) throw new NotFoundException('Demo organization not created yet — call POST /platform/demo/reset');
    await this.demoLiveService.tick(org.id);
    return { organizationId: org.id };
  }

  @Get('status')
  @ApiOperation({ summary: 'Demo restaurant id and whether a rebuild is running' })
  async status() {
    const org = await this.demoSeedService.findDemoOrg();
    return { organizationId: org?.id ?? null, rebuilding: this.demoSeedService.isPopulating() };
  }
}
