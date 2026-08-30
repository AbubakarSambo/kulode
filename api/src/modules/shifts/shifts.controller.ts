import { Controller, Get, Post, Body, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiProduces } from '@nestjs/swagger';
import { ShiftsService } from './shifts.service';
import { ShiftReportPdfService } from './shift-report-pdf.service';
import { OpenShiftDto, CloseShiftDto } from './dto';
import { CurrentUser, CurrentUserData } from '../../common';

@ApiTags('Shifts')
@ApiBearerAuth()
@Controller('shifts')
export class ShiftsController {
  constructor(
    private readonly shiftsService: ShiftsService,
    private readonly shiftReportPdfService: ShiftReportPdfService,
  ) {}

  @Get()
  findAll(@CurrentUser('organizationId') organizationId: string) {
    return this.shiftsService.findAll(organizationId);
  }

  @Get('current')
  findCurrent(@CurrentUser('organizationId') organizationId: string) {
    return this.shiftsService.findCurrent(organizationId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shiftsService.findOne(organizationId, id);
  }

  @Get(':id/preview-close')
  previewClose(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shiftsService.previewClose(organizationId, id);
  }

  @Get(':id/report')
  @ApiProduces('application/pdf')
  async downloadReport(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const shift = await this.shiftsService.getReportData(organizationId, id);
    const pdfBuffer = await this.shiftReportPdfService.generatePdf(shift);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="shift-report-${shift.id.slice(0, 8)}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  @Post('open')
  open(
    @Body() dto: OpenShiftDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.shiftsService.open(user.organizationId, user.id, dto);
  }

  @Post(':id/close')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseShiftDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.shiftsService.close(user.organizationId, id, user.id, dto);
  }
}
