import { Controller, Get, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { PharmacySeedService } from './pharmacy-seed.service';
import { PharmacyLiveService } from './pharmacy-live.service';

@ApiTags('Platform')
@ApiBearerAuth()
@Controller('platform/demo/pharmacy')
@UseGuards(PlatformAdminGuard)
export class PharmacyDemoController {
  constructor(
    private readonly pharmacySeedService: PharmacySeedService,
    private readonly pharmacyLiveService: PharmacyLiveService,
  ) {}

  @Post('reset')
  @ApiOperation({ summary: 'Create or rebuild the sales-demo pharmacy (wipes its POS data)' })
  async reset() {
    return this.pharmacySeedService.reset();
  }

  @Post('tick')
  @ApiOperation({ summary: 'Advance the demo pharmacy to now (same as the 15-minute job)' })
  async tick() {
    const org = await this.pharmacySeedService.findDemoOrg();
    if (!org) throw new NotFoundException('Demo pharmacy not created yet — call POST /platform/demo/pharmacy/reset');
    await this.pharmacyLiveService.tick(org.id);
    return { organizationId: org.id };
  }

  @Get('status')
  @ApiOperation({ summary: 'Demo pharmacy id and whether a rebuild is running' })
  async status() {
    const org = await this.pharmacySeedService.findDemoOrg();
    return { organizationId: org?.id ?? null, rebuilding: this.pharmacySeedService.isPopulating() };
  }
}
