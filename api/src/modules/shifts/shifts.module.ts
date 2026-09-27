import { Module } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { ShiftsController } from './shifts.controller';
import { ShiftReportPdfService } from './shift-report-pdf.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule],
  controllers: [ShiftsController],
  providers: [ShiftsService, ShiftReportPdfService],
  exports: [ShiftsService],
})
export class ShiftsModule {}
