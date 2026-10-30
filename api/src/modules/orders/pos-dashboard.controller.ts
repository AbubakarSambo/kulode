import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PosDashboardService } from './pos-dashboard.service';
import { ReportFilterDto } from '../reports/dto';
import { CurrentUser, Can } from '../../common';

@ApiTags('POS Dashboard')
@ApiBearerAuth()
@Controller('pos-dashboard')
export class PosDashboardController {
  constructor(private readonly posDashboardService: PosDashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get POS sales summary (income, orders, top items)' })
  @Can('POS_DASHBOARD_VIEW')
  async getSummary(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: ReportFilterDto,
  ) {
    return this.posDashboardService.getSummary(organizationId, filter);
  }

  @Get('today')
  @ApiOperation({ summary: "Get today's running takings (paid + open) for the strip above the POS pages" })
  @Can('TODAY_TAKINGS_VIEW')
  async getTodayTakings(@CurrentUser('organizationId') organizationId: string) {
    return this.posDashboardService.getTodayTakings(organizationId);
  }

  @Get('trend')
  @ApiOperation({ summary: 'Get daily POS sales trend' })
  @Can('POS_DASHBOARD_VIEW')
  async getTrend(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: ReportFilterDto,
  ) {
    return this.posDashboardService.getTrend(organizationId, filter);
  }
}
