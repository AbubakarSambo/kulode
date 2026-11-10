import { Module } from '@nestjs/common';
import { PrintersService } from './printers.service';
import { PrintingService } from './printing.service';
import { PrintersController } from './printers.controller';
import { PrintAgentController } from './print-agent.controller';
import { PrintAgentPairingController } from './print-agent-pairing.controller';
import { PrintAgentGuard } from './print-agent.guard';
import { PrintDiagnosticsService } from './print-diagnostics.service';
import { PlatformPrintingController } from './platform-printing.controller';

@Module({
  controllers: [PrintersController, PrintAgentPairingController, PrintAgentController, PlatformPrintingController],
  providers: [PrintersService, PrintingService, PrintDiagnosticsService, PrintAgentGuard],
  exports: [PrintersService, PrintingService],
})
export class PrintersModule {}
