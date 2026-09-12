import { Module } from '@nestjs/common';
import { PosReportsService } from './pos-reports.service';
import { PosReportsController } from './pos-reports.controller';

@Module({
  controllers: [PosReportsController],
  providers: [PosReportsService],
  exports: [PosReportsService],
})
export class PosReportsModule {}
