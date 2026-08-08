import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PosDashboardService } from './pos-dashboard.service';
import { ReportFilterDto } from '../reports/dto';
import { CurrentUser } from '../../common';

@ApiTags('POS Dashboard')
@ApiBearerAuth()
@Controller('pos-dashboard')
export class PosDashboardController {
  constructor(private readonly posDashboardService: PosDashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get POS sales summary (income, orders, top items)' })
  async getSummary(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: ReportFilterDto,
  ) {
    return this.posDashboardService.getSummary(organizationId, filter);
  }

  @Get('trend')
  @ApiOperation({ summary: 'Get daily POS sales trend' })
  async getTrend(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: ReportFilterDto,
  ) {
    return this.posDashboardService.getTrend(organizationId, filter);
  }
}
