import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { CreatePaymentDto, UpdatePaymentDto, PaymentFilterDto } from './dto';
import { CurrentUser, CurrentUserData, Roles, Role } from '../../common';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly receiptPdfService: ReceiptPdfService,
  ) {}

  @Get('payments')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'List all payments' })
  @ApiResponse({ status: 200, description: 'List of payments' })
  async findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: PaymentFilterDto,
  ) {
    return this.paymentsService.findAll(organizationId, filter);
  }

  @Get('payments/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Get payment by ID' })
  @ApiResponse({ status: 200, description: 'Payment details' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.paymentsService.findOne(id, organizationId);
  }

  @Post('invoices/:invoiceId/payments')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Record payment for invoice' })
  @ApiResponse({ status: 201, description: 'Payment recorded' })
  @ApiResponse({ status: 400, description: 'Invalid payment' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async createForInvoice(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.paymentsService.createForInvoice(
      invoiceId,
      user.organizationId,
      user.id,
      dto,
    );
  }

  @Patch('payments/:id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update payment' })
  @ApiResponse({ status: 200, description: 'Payment updated' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.paymentsService.update(id, organizationId, dto);
  }

  @Delete('payments/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Delete payment' })
  @ApiResponse({ status: 200, description: 'Payment deleted' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.paymentsService.remove(id, organizationId);
  }

  @Get('payments/:id/receipt')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Download payment receipt PDF' })
  @ApiResponse({ status: 200, description: 'Receipt PDF' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async downloadReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
    @Res() res: Response,
  ) {
    const receiptData = await this.paymentsService.getReceiptData(
      id,
      organizationId,
    );

    const pdfBuffer = await this.receiptPdfService.generatePdf(receiptData);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${receiptData.receiptNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }
}
