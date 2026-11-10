import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { PrintDiagnosticsService } from './print-diagnostics.service';
import { PrintingService } from './printing.service';

// Printer support for platform admins, addressed by organization id and called with the
// admin's own session. "View as" is read-only by design; these two actions (a test page, a
// network search) are the deliberate exceptions, so they live here rather than loosening that.
@ApiTags('Platform')
@ApiBearerAuth()
@Controller('platform/organizations/:organizationId/printing')
@UseGuards(PlatformAdminGuard)
export class PlatformPrintingController {
  constructor(
    private readonly diagnosticsService: PrintDiagnosticsService,
    private readonly printingService: PrintingService,
  ) {}

  @Get()
  @ApiOperation({ summary: "An organization's print agent, printers, recent jobs and agent log" })
  getDiagnostics(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.diagnosticsService.getDiagnostics(organizationId);
  }

  @Post('scan')
  @ApiOperation({ summary: "Ask the organization's agent to search its network for printers" })
  requestScan(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser('email') email: string,
  ) {
    return this.diagnosticsService.requestScan(organizationId, email);
  }

  @Post('printers/:printerId/test-print')
  @ApiOperation({ summary: 'Send a test page to one of the organization\'s printers' })
  testPrint(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('printerId', ParseUUIDPipe) printerId: string,
    @CurrentUser('email') email: string,
  ) {
    return this.diagnosticsService.testPrint(organizationId, printerId, email);
  }

  @Get('jobs/:jobId')
  getJob(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    return this.printingService.getJobStatus(organizationId, jobId);
  }
}
