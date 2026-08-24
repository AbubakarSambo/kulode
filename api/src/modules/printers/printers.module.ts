import { Module } from '@nestjs/common';
import { PrintersService } from './printers.service';
import { PrintingService } from './printing.service';
import { PrintersController } from './printers.controller';
import { PrintAgentController } from './print-agent.controller';
import { PrintAgentGuard } from './print-agent.guard';

@Module({
  controllers: [PrintersController, PrintAgentController],
  providers: [PrintersService, PrintingService, PrintAgentGuard],
  exports: [PrintersService, PrintingService],
})
export class PrintersModule {}
