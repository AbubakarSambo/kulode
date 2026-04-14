import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { TaxService } from './tax.service';
import { FilingPackQueryDto, DeductibleSummaryQueryDto } from './dto';
import { CurrentUser, Roles, Role, RequiresPlan, PlanGuard } from '../../common';

@ApiTags('Tax')
@ApiBearerAuth()
@UseGuards(PlanGuard)
@RequiresPlan('PRO')
@Controller('tax')
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Get('deductible-summary')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Deductible expenses YTD summary for dashboard' })
  async getDeductibleSummary(
    @CurrentUser('organizationId') organizationId: string,
    @Query() query: DeductibleSummaryQueryDto,
  ) {
    const year = query.year ? parseInt(query.year, 10) : new Date().getFullYear();
    if (isNaN(year)) throw new BadRequestException('Invalid year');
    return this.taxService.getDeductibleSummary(organizationId, year);
  }

  @Get('filing-pack/preview')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Preview filing pack data' })
  async preview(
    @CurrentUser('organizationId') organizationId: string,
    @Query() query: FilingPackQueryDto,
  ) {
    const { startDate, endDate } = this.parseDates(query);
    return this.taxService.getFilingPackPreview(organizationId, startDate, endDate);
  }

  @Post('filing-pack/download/pdf-summary')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Download filing pack PDF summary' })
  async downloadPdfSummary(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Query() query: FilingPackQueryDto,
    @Res() res: Response,
  ) {
    const { startDate, endDate } = this.parseDates(query);
    const [pdf] = await Promise.all([
      this.taxService.generatePdfSummary(organizationId, startDate, endDate),
      this.taxService.logGeneration(organizationId, userId, startDate, endDate),
    ]);

    const filename = `tax-summary-${query.startDate}-to-${query.endDate}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  }

  @Post('filing-pack/download/csv')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Download filing pack CSV (Excel-compatible)' })
  async downloadCsv(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Query() query: FilingPackQueryDto,
    @Res() res: Response,
  ) {
    const { startDate, endDate } = this.parseDates(query);
    const [csv] = await Promise.all([
      this.taxService.generateCsv(organizationId, startDate, endDate),
      this.taxService.logGeneration(organizationId, userId, startDate, endDate),
    ]);

    const filename = `tax-data-${query.startDate}-to-${query.endDate}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('report-logs')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'List tax report generation audit logs' })
  async getReportLogs(@CurrentUser('organizationId') organizationId: string) {
    return this.taxService.getReportLogs(organizationId);
  }

  private parseDates(query: FilingPackQueryDto): { startDate: Date; endDate: Date } {
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    // Ensure end date covers the full day
    endDate.setHours(23, 59, 59, 999);
    return { startDate, endDate };
  }
}
