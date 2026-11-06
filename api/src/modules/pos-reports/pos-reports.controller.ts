import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PosReportsService } from './pos-reports.service';
import { SalesReportService } from './sales-report.service';
import { ItemSalesReportQueryDto } from './dto';
import { CurrentUser, CurrentUserData, Can, hasPermission } from '../../common';

@ApiTags('POS Reports')
@ApiBearerAuth()
@Controller('pos-reports')
export class PosReportsController {
  constructor(
    private readonly posReportsService: PosReportsService,
    private readonly salesReportService: SalesReportService,
  ) {}

  @Get('sales-report')
  @ApiOperation({ summary: 'Sales report: headline numbers, Department › Category › Item breakdown, dayparts, order types, payments, staff and controls' })
  @Can('POS_SALES_REPORT_VIEW')
  getSalesReport(
    @CurrentUser() user: CurrentUserData,
    @Query() query: ItemSalesReportQueryDto,
  ) {
    // A waiter sees only the orders they served — the org's full takings aren't floor-staff business.
    const waiterId = hasPermission(user.roles, 'POS_REPORTS_ALL') ? undefined : user.id;
    return this.salesReportService.getSalesReport(user.organizationId, query, waiterId);
  }

  @Get('item-sales')
  @ApiOperation({ summary: 'Item sales report: sales/quantity by category and product for a date range' })
  @Can('POS_REPORTS_VIEW')
  getItemSalesReport(
    @CurrentUser() user: CurrentUserData,
    @Query() query: ItemSalesReportQueryDto,
  ) {
    // A waiter sees only the orders they served — the org's full takings aren't floor-staff business.
    const waiterId = hasPermission(user.roles, 'POS_REPORTS_ALL') ? undefined : user.id;
    return this.posReportsService.getItemSalesReport(user.organizationId, query.from, query.to, query.fromTime, query.toTime, waiterId);
  }
}
