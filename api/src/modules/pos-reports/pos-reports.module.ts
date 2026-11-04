import { Module } from '@nestjs/common';
import { PosReportsService } from './pos-reports.service';
import { PosReportsController } from './pos-reports.controller';
import { SalesReportService } from './sales-report.service';

@Module({
  controllers: [PosReportsController],
  providers: [PosReportsService, SalesReportService],
  exports: [PosReportsService],
})
export class PosReportsModule {}
