import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PosReportsService } from './pos-reports.service';
import { ItemSalesReportQueryDto } from './dto';
import { CurrentUser, CurrentUserData, Can, hasPermission } from '../../common';

@ApiTags('POS Reports')
@ApiBearerAuth()
@Controller('pos-reports')
export class PosReportsController {
  constructor(private readonly posReportsService: PosReportsService) {}

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
