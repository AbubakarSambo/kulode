import { Controller, Get, Post, Patch, Put, Delete, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrintersService } from './printers.service';
import { PrintingService } from './printing.service';
import { CreatePrinterDto, UpdatePrinterDto, SetPrinterCategoriesDto } from './dto';
import { CurrentUser, Roles, Role } from '../../common';

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

  @Post('print-jobs/:jobId/retry')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.SUPERVISOR, Role.CASHIER)
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
