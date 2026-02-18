import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PlatformService } from './platform.service';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';

@ApiTags('Platform')
@ApiBearerAuth()
@Controller('platform')
@UseGuards(PlatformAdminGuard)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get platform admin dashboard data' })
  @ApiResponse({ status: 200, description: 'Platform dashboard data' })
  @ApiResponse({ status: 403, description: 'Not a platform admin' })
  async getDashboard() {
    return this.platformService.getDashboard();
  }
}
