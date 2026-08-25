import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common';
import { PrintingService } from './printing.service';
import { PrintAgentGuard } from './print-agent.guard';
import { PrintAgentOrg } from './print-agent-org.decorator';
import { ReportJobResultDto } from './dto';

// Polled by the on-premise print agent, not by the web app — authenticated with the org's
// print agent token (PrintAgentGuard), not a user JWT. See PrintingService for why this exists:
// the backend has no network route to a printer's private LAN IP.
@ApiExcludeController()
@Public()
@UseGuards(PrintAgentGuard)
@Controller('print-agent')
export class PrintAgentController {
  constructor(private readonly printingService: PrintingService) {}

  @Get('jobs')
  getPendingJobs(@PrintAgentOrg() organizationId: string) {
    return this.printingService.claimPendingJobs(organizationId);
  }

  @Patch('jobs/:id')
  reportResult(
    @PrintAgentOrg() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportJobResultDto,
  ) {
    return this.printingService.reportJobResult(organizationId, id, dto.status, dto.error);
  }
}
