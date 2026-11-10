import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common';
import { PrintingService } from './printing.service';
import { PrintAgentGuard } from './print-agent.guard';
import { PrintAgentOrg } from './print-agent-org.decorator';
import { PrintersService } from './printers.service';
import { ReportDiscoveryDto, ReportJobResultDto } from './dto';

// Polled by the on-premise print agent, not by the web app — authenticated with the org's
// print agent token (PrintAgentGuard), not a user JWT. See PrintingService for why this exists:
// the backend has no network route to a printer's private LAN IP.
@ApiExcludeController()
@Public()
@UseGuards(PrintAgentGuard)
@Controller('print-agent')
export class PrintAgentController {
  constructor(
    private readonly printingService: PrintingService,
    private readonly printersService: PrintersService,
  ) {}

  @Get('jobs')
  async getPendingJobs(
    @PrintAgentOrg() organizationId: string,
    @Query('v') version: string | undefined,
    @Req() request: { printAgentScanRequested?: boolean },
  ) {
    const jobs = await this.printingService.claimPendingJobs(organizationId);
    // Agents from before printer discovery expect a bare list of jobs. Newer ones ask for v=2
    // and also learn, on the same poll, whether an admin is waiting on a network scan.
    if (version !== '2') return jobs;
    return { jobs, scanRequested: !!request.printAgentScanRequested };
  }

  @HttpCode(200)
  @Post('discovered')
  reportDiscovery(@PrintAgentOrg() organizationId: string, @Body() dto: ReportDiscoveryDto) {
    return this.printersService.recordDiscovery(organizationId, dto.devices);
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
