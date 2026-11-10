import { Controller, Get, Post, Patch, Put, Delete, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrintersService } from './printers.service';
import { PrintingService } from './printing.service';
import { CreatePrinterDto, UpdatePrinterDto, SetPrinterCategoriesDto } from './dto';
import { CurrentUser, Roles, Role, Can } from '../../common';

@ApiTags('Printers')
@ApiBearerAuth()
@Controller('printers')
export class PrintersController {
  constructor(
    private readonly printersService: PrintersService,
    private readonly printingService: PrintingService,
  ) {}

  @Get()
  findAll(@CurrentUser('organizationId') organizationId: string) {
    return this.printersService.findAll(organizationId);
  }

  // Must come before `:id` — otherwise "agent-token" would be matched as an :id param.
  @Get('agent-token/status')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  getAgentStatus(@CurrentUser('organizationId') organizationId: string) {
    return this.printersService.getAgentStatus(organizationId);
  }

  @Post('agent-token/rotate')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  rotateAgentToken(@CurrentUser('organizationId') organizationId: string) {
    return this.printersService.rotateAgentToken(organizationId);
  }

  @Post('agent-pairing-code')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  createPairingCode(@CurrentUser('organizationId') organizationId: string) {
    return this.printersService.createPairingCode(organizationId);
  }

  @Get('discovery')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  getDiscovery(@CurrentUser('organizationId') organizationId: string) {
    return this.printersService.getDiscovery(organizationId);
  }

  @Post('discovery/scan')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  requestScan(@CurrentUser('organizationId') organizationId: string) {
    return this.printersService.requestScan(organizationId);
  }

  @Get('print-jobs/:jobId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  getJobStatus(
    @CurrentUser('organizationId') organizationId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    return this.printingService.getJobStatus(organizationId, jobId);
  }

  @Post('print-jobs/:jobId/retry')
  @Can('PRINT_RETRY')
  async retryJob(
    @CurrentUser('organizationId') organizationId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    await this.printingService.retryJob(organizationId, jobId);
    return { message: 'Reprint queued' };
  }

  @Get(':id')
  findOne(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.printersService.findOne(organizationId, id);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  create(
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: CreatePrinterDto,
  ) {
    return this.printersService.create(organizationId, dto);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  update(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePrinterDto,
  ) {
    return this.printersService.update(organizationId, id, dto);
  }

  @Post(':id/test-print')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  testPrint(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.printingService.queueTestPrint(organizationId, id);
  }

  @Put(':id/categories')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  setCategories(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPrinterCategoriesDto,
  ) {
    return this.printersService.setCategories(organizationId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  remove(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.printersService.remove(organizationId, id);
  }
}
