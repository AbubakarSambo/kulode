import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportFilterDto } from './dto';
import { CurrentUser, Roles, Role } from '../../common';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get financial summary (income, expenses, profit)' })
  @ApiResponse({ status: 200, description: 'Financial summary' })
  async getSummary(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: ReportFilterDto,
  ) {
    return this.reportsService.getSummary(organizationId, filter);
  }

  @Get('income')
  @ApiOperation({ summary: 'Get income breakdown by month, method, and client' })
  @ApiResponse({ status: 200, description: 'Income breakdown' })
  async getIncomeBreakdown(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: ReportFilterDto,
  ) {
    return this.reportsService.getIncomeBreakdown(organizationId, filter);
  }

  @Get('expenses')
  @ApiOperation({ summary: 'Get expense breakdown by month and category' })
  @ApiResponse({ status: 200, description: 'Expense breakdown' })
  async getExpenseBreakdown(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: ReportFilterDto,
  ) {
    return this.reportsService.getExpenseBreakdown(organizationId, filter);
  }

  @Get('outstanding')
  @ApiOperation({ summary: 'Get outstanding and overdue invoices' })
  @ApiResponse({ status: 200, description: 'Outstanding invoices' })
  async getOutstandingInvoices(
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.reportsService.getOutstandingInvoices(organizationId);
  }

  @Get('cashflow')
  @ApiOperation({ summary: 'Get monthly cashflow (income vs expenses)' })
  @ApiResponse({ status: 200, description: 'Cashflow report' })
  async getCashflow(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: ReportFilterDto,
  ) {
    return this.reportsService.getCashflow(organizationId, filter);
  }

  @Get('top-services')
  @ApiOperation({ summary: 'Get top 5 service items by revenue' })
  @ApiResponse({ status: 200, description: 'Top services by revenue' })
  async getTopServices(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: ReportFilterDto,
  ) {
    return this.reportsService.getTopServices(organizationId, filter);
  }
}
