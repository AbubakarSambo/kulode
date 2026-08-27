import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PosReportsService } from './pos-reports.service';
import { ItemSalesReportQueryDto } from './dto';
import { CurrentUser, Roles, Role } from '../../common';

@ApiTags('POS Reports')
@ApiBearerAuth()
@Controller('pos-reports')
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
export class PosReportsController {
  constructor(private readonly posReportsService: PosReportsService) {}

  @Get('item-sales')
  @ApiOperation({ summary: 'Item sales report: sales/quantity by category and product for a date range' })
  getItemSalesReport(
    @CurrentUser('organizationId') organizationId: string,
    @Query() query: ItemSalesReportQueryDto,
  ) {
    return this.posReportsService.getItemSalesReport(organizationId, query.from, query.to);
  }
}
