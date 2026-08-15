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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProduces } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { PaystackService } from '../paystack/paystack.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  InvoiceFilterDto,
  CreateServiceItemDto,
  UpdateServiceItemDto,
} from './dto';
import { CurrentUser, CurrentUserData, Roles, Role, Public } from '../../common';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly invoicePdfService: InvoicePdfService,
    private readonly paystackService: PaystackService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all invoices with filters' })
  @ApiResponse({ status: 200, description: 'List of invoices' })
  async findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: InvoiceFilterDto,
  ) {
    return this.invoicesService.findAll(organizationId, filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice by ID with items and payments' })
  @ApiResponse({ status: 200, description: 'Invoice details' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.invoicesService.findOne(id, organizationId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new invoice' })
  @ApiResponse({ status: 201, description: 'Invoice created' })
  @ApiResponse({ status: 404, description: 'Client not found' })
  async create(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.invoicesService.create(user.organizationId, user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update invoice (draft only)' })
  @ApiResponse({ status: 200, description: 'Invoice updated' })
  @ApiResponse({ status: 403, description: 'Only draft invoices can be edited' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.invoicesService.update(id, organizationId, dto);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Mark invoice as sent' })
  @ApiResponse({ status: 200, description: 'Invoice marked as sent' })
  @ApiResponse({ status: 400, description: 'Invoice is not in draft status' })
  async markAsSent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.invoicesService.markAsSent(id, organizationId);
  }

  @Post(':id/send-reminder')
  @ApiOperation({ summary: 'Send payment reminder to client' })
  @ApiResponse({ status: 200, description: 'Reminder sent' })
  @ApiResponse({ status: 400, description: 'Invoice not in a remindable state or client has no email' })
  async sendReminder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.invoicesService.sendReminder(id, organizationId);
  }

  @Post(':id/send-whatsapp-reminder')
  @ApiOperation({ summary: 'Send payment reminder to client via WhatsApp' })
  @ApiResponse({ status: 200, description: 'WhatsApp reminder sent' })
  @ApiResponse({ status: 400, description: 'Invoice not in a remindable state or client has not opted in to WhatsApp' })
  async sendWhatsappReminder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.invoicesService.sendWhatsappReminder(id, organizationId);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate an invoice as a new draft' })
  @ApiResponse({ status: 201, description: 'Duplicated invoice' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.invoicesService.duplicate(id, user.organizationId, user.id);
  }

  @Post(':id/cancel')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Cancel invoice' })
  @ApiResponse({ status: 200, description: 'Invoice cancelled' })
  @ApiResponse({ status: 400, description: 'Cannot cancel paid invoice' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.invoicesService.cancel(id, organizationId);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Delete invoice (super admins can delete any, others draft only)' })
  @ApiResponse({ status: 200, description: 'Invoice deleted' })
  @ApiResponse({ status: 403, description: 'Only draft invoices can be deleted' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.invoicesService.remove(id, user.organizationId, user.roles);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download invoice as PDF' })
  @ApiResponse({ status: 200, description: 'PDF file' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  @ApiProduces('application/pdf')
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
    @Res() res: Response,
  ) {
    let invoice = await this.invoicesService.findOneWithOrganization(id, organizationId);

    // Generate payment links for unpaid installments. Skipped for DRAFT invoices —
    // downloading a preview shouldn't have the side effect of sending the invoice
    // (auto-generating a link on a DRAFT invoice transitions it to SENT and emails the client).
    const balanceDue = invoice.total - invoice.amountPaid;
    if (invoice.status !== 'DRAFT' && balanceDue > 0 && invoice.client.email) {
      try {
        if (invoice.installments && invoice.installments.length > 0) {
          // Use installment-based payment links
          for (const inst of invoice.installments) {
            if (!inst.isPaid && !inst.paymentUrl) {
              await this.paystackService.initializeInstallmentTransaction(
                organizationId,
                id,
                inst.id,
                invoice.client.email,
                inst.amount,
              );
            }
          }
          // Refresh invoice to get the new payment URLs
          invoice = await this.invoicesService.findOneWithOrganization(id, organizationId);
        } else if (!invoice.paymentUrl) {
          // No installments - generate single payment link for full balance
          await this.paystackService.initializeTransaction(
            organizationId,
            id,
            invoice.client.email,
            balanceDue,
          );
          invoice = await this.invoicesService.findOneWithOrganization(id, organizationId);
        }
      } catch (error) {
        // If payment link generation fails, continue without it
        console.error('Failed to generate payment link for PDF:', error);
      }
    }

    const pdfBuffer = await this.invoicePdfService.generatePdf(invoice as any);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.send(pdfBuffer);
  }

  @Get(':id/png')
  @ApiOperation({ summary: 'Download invoice as PNG' })
  @ApiResponse({ status: 200, description: 'PNG file' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  @ApiProduces('image/png')
  async downloadPng(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
    @Res() res: Response,
  ) {
    let invoice = await this.invoicesService.findOneWithOrganization(id, organizationId);

    // Generate payment links for unpaid installments. Skipped for DRAFT invoices —
    // downloading a preview shouldn't have the side effect of sending the invoice
    // (auto-generating a link on a DRAFT invoice transitions it to SENT and emails the client).
    const balanceDue = invoice.total - invoice.amountPaid;
    if (invoice.status !== 'DRAFT' && balanceDue > 0 && invoice.client.email) {
      try {
        if (invoice.installments && invoice.installments.length > 0) {
          for (const inst of invoice.installments) {
            if (!inst.isPaid && !inst.paymentUrl) {
              await this.paystackService.initializeInstallmentTransaction(
                organizationId,
                id,
                inst.id,
                invoice.client.email,
                inst.amount,
              );
            }
          }
          invoice = await this.invoicesService.findOneWithOrganization(id, organizationId);
        } else if (!invoice.paymentUrl) {
          await this.paystackService.initializeTransaction(
            organizationId,
            id,
            invoice.client.email,
            balanceDue,
          );
          invoice = await this.invoicesService.findOneWithOrganization(id, organizationId);
        }
      } catch (error) {
        console.error('Failed to generate payment link for PNG:', error);
      }
    }

    const pngBuffer = await this.invoicePdfService.generatePng(invoice as any);

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.png"`,
      'Content-Length': pngBuffer.length,
    });

    res.send(pngBuffer);
  }

  @Post(':id/share')
  @ApiOperation({ summary: 'Generate or get share token for invoice' })
  @ApiResponse({ status: 200, description: 'Share token' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async generateShareToken(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.invoicesService.generateShareToken(id, organizationId);
  }

  @Get('public/shorten')
  @Public()
  @ApiOperation({ summary: 'Shorten a URL using TinyURL' })
  async shortenUrl(@Query('url') url: string) {
    if (!url) {
      return { url: '' };
    }
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, {
        signal: controller.signal,
      });
      clearTimeout(id);
      if (response.ok) {
        const text = await response.text();
        if (text && text.startsWith('http')) {
          return { url: text.trim() };
        }
      }
    } catch (err) {
      // Ignore and fallback
    }
    return { url };
  }

  @Get('public/short-links/:slug')
  @Public()
  @ApiOperation({ summary: 'Resolve internal short link slug' })
  async resolveShortLink(@Param('slug') slug: string) {
    const targetUrl = await this.invoicesService.resolveShortLink(slug);
    return { targetUrl };
  }

  @Get('public/:token')
  @Public()
  @ApiOperation({ summary: 'Get invoice by public share token' })
  @ApiResponse({ status: 200, description: 'Invoice details' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async findByShareToken(@Param('token') token: string) {
    return this.invoicesService.findByShareToken(token);
  }

  @Get('public/:token/pdf')
  @Public()
  @ApiOperation({ summary: 'Download invoice PDF by share token' })
  @ApiResponse({ status: 200, description: 'PDF file' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  @ApiProduces('application/pdf')
  async downloadPublicPdf(
    @Param('token') token: string,
    @Res() res: Response,
  ) {
    let invoice = await this.invoicesService.findByShareToken(token);

    // Generate payment links for unpaid installments
    const balanceDue = invoice.total - invoice.amountPaid;
    if (balanceDue > 0 && invoice.client.email) {
      try {
        if (invoice.installments && invoice.installments.length > 0) {
          // Use installment-based payment links
          for (const inst of invoice.installments) {
            if (!inst.isPaid && !inst.paymentUrl) {
              await this.paystackService.initializeInstallmentTransaction(
                invoice.organizationId,
                invoice.id,
                inst.id,
                invoice.client.email,
                inst.amount,
              );
            }
          }
          // Refresh invoice to get the new payment URLs
          invoice = await this.invoicesService.findByShareToken(token);
        } else if (!invoice.paymentUrl) {
          // No installments - generate single payment link for full balance
          await this.paystackService.initializeTransaction(
            invoice.organizationId,
            invoice.id,
            invoice.client.email,
            balanceDue,
          );
          invoice = await this.invoicesService.findByShareToken(token);
        }
      } catch (error) {
        // If payment link generation fails, continue without it
        console.error('Failed to generate payment link for public PDF:', error);
      }
    }

    const pdfBuffer = await this.invoicePdfService.generatePdf(invoice as any);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.send(pdfBuffer);
  }

  @Get('public/:token/png')
  @Public()
  @ApiOperation({ summary: 'Download invoice PNG by share token' })
  @ApiResponse({ status: 200, description: 'PNG file' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  @ApiProduces('image/png')
  async downloadPublicPng(
    @Param('token') token: string,
    @Res() res: Response,
  ) {
    let invoice = await this.invoicesService.findByShareToken(token);

    // Generate payment links for unpaid installments
    const balanceDue = invoice.total - invoice.amountPaid;
    if (balanceDue > 0 && invoice.client.email) {
      try {
        if (invoice.installments && invoice.installments.length > 0) {
          for (const inst of invoice.installments) {
            if (!inst.isPaid && !inst.paymentUrl) {
              await this.paystackService.initializeInstallmentTransaction(
                invoice.organizationId,
                invoice.id,
                inst.id,
                invoice.client.email,
                inst.amount,
              );
            }
          }
          invoice = await this.invoicesService.findByShareToken(token);
        } else if (!invoice.paymentUrl) {
          await this.paystackService.initializeTransaction(
            invoice.organizationId,
            invoice.id,
            invoice.client.email,
            balanceDue,
          );
          invoice = await this.invoicesService.findByShareToken(token);
        }
      } catch (error) {
        console.error('Failed to generate payment link for public PNG:', error);
      }
    }

    const pngBuffer = await this.invoicePdfService.generatePng(invoice as any);

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.png"`,
      'Content-Length': pngBuffer.length,
    });

    res.send(pngBuffer);
  }
}

@ApiTags('Service Items')
@ApiBearerAuth()
@Controller('service-items')
export class ServiceItemsController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT, Role.STAFF)
  @ApiOperation({ summary: 'List all active service items' })
  @ApiResponse({ status: 200, description: 'List of service items' })
  async findAll(@CurrentUser('organizationId') organizationId: string) {
    return this.invoicesService.findAllServiceItems(organizationId);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new service item' })
  @ApiResponse({ status: 201, description: 'Service item created' })
  @ApiResponse({ status: 409, description: 'Service item with this name already exists' })
  async create(
    @Body() dto: CreateServiceItemDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.invoicesService.createServiceItem(organizationId, dto);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update a service item' })
  @ApiResponse({ status: 200, description: 'Service item updated' })
  @ApiResponse({ status: 404, description: 'Service item not found' })
  @ApiResponse({ status: 409, description: 'Service item with this name already exists' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceItemDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.invoicesService.updateServiceItem(id, organizationId, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Delete a service item' })
  @ApiResponse({ status: 200, description: 'Service item deleted' })
  @ApiResponse({ status: 404, description: 'Service item not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.invoicesService.removeServiceItem(id, organizationId);
  }
}
