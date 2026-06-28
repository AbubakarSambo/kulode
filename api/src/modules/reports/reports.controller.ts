import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProduces } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportPdfService } from './report-pdf.service';
import { ReportFilterDto } from './dto';
import { CurrentUser, Roles, Role, RequiresPlan, PlanGuard } from '../../common';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(PlanGuard)
@RequiresPlan('PRO')
@Controller('reports')
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly reportPdfService: ReportPdfService,
  ) {}

  @Get('pdf')
  @ApiOperation({ summary: 'Download financial report as PDF' })
  @ApiResponse({ status: 200, description: 'PDF file' })
  @ApiProduces('application/pdf')
  async downloadPdf(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: ReportFilterDto,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.reportPdfService.generatePdf(organizationId, filter);
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Financial_Report_${filter.period || 'CUSTOM'}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    
    res.send(pdfBuffer);
  }

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

  @Get('top-products')
  @ApiOperation({ summary: 'Get top 5 inventory products by revenue' })
  @ApiResponse({ status: 200, description: 'Top products by revenue' })
  async getTopProducts(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: ReportFilterDto,
  ) {
    return this.reportsService.getTopProducts(organizationId, filter);
  }
}
