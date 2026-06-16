import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as https from 'https';
import * as http from 'http';
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface Installment {
  id: string;
  label: string;
  sequence: number;
  percentage: number;
  amount: number;
  isPaid: boolean;
  paymentUrl?: string | null;
}

interface InvoiceData {
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  status: string;
  subtotal: number;
  discountType?: string;
  discountPercent?: number;
  discountAmount?: number;
  taxRate?: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  notes?: string | null;
  terms?: string | null;
  paymentUrl?: string | null;
  organization: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    logo?: string | null;
    planTier?: string | null;
    subscriptionStatus?: string | null;
    showQrCode?: boolean | null;
  };
  client: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  installments?: Installment[];
}

@Injectable()
export class InvoicePdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async generatePdf(invoice: InvoiceData): Promise<Buffer> {
    // Paying PRO/BUSINESS orgs don't show "Powered by Tari1" footer text; FREE/trialing do.
    // However, the Tari1 Logo is drawn at the center of the footer for branding consistency.
    const isPayingPro = (invoice.organization.planTier === 'PRO' || invoice.organization.planTier === 'BUSINESS')
      && invoice.organization.subscriptionStatus !== 'TRIALING';
    const isPro = isPayingPro;

    let logoBuffer: Buffer | null = null;
    if (invoice.organization.logo) {
      try {
        logoBuffer = await this.fetchImageBuffer(invoice.organization.logo);
      } catch {
        // Skip if organization logo can't be loaded
      }
    }

    // Determine target URL for the QR code
    const qrTargetUrl = invoice.paymentUrl || (invoice.installments && invoice.installments.find(i => !i.isPaid)?.paymentUrl);
    let qrBuffer: Buffer | null = null;
    if (invoice.organization.showQrCode && qrTargetUrl) {
      try {
        const shortenedQrUrl = await this.tryShortenUrl(qrTargetUrl);
        qrBuffer = await QRCode.toBuffer(shortenedQrUrl, { width: 80, margin: 1 });
      } catch {
        // Skip if QR generation fails
      }
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Invoice ${invoice.invoiceNumber}`,
          Author: invoice.organization.name,
        }
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Colors from DESIGN.md
      const primaryColor = '#0037b0';
      const textColor = '#121c28';
      const mutedColor = '#434655';
      const successColor = '#006c49';
      const errorColor = '#ba1a1a';

      // Header - Logo + Organization name (left side)
      let orgY = 50;
      if (logoBuffer) {
        doc.image(logoBuffer, 50, orgY, { fit: [120, 40] });
        orgY += 48;
      }

      doc
        .fillColor(textColor)
        .fontSize(logoBuffer ? 13 : 20)
        .font('Helvetica-Bold')
        .text(invoice.organization.name, 50, orgY);
      orgY += logoBuffer ? 18 : 25;

      doc.fillColor(mutedColor).fontSize(9).font('Helvetica');

      if (invoice.organization.email) {
        doc.text(invoice.organization.email, 50, orgY);
        orgY += 13;
      }
      if (invoice.organization.phone) {
        doc.text(invoice.organization.phone, 50, orgY);
        orgY += 13;
      }
      if (invoice.organization.address) {
        const addrHeight = doc.heightOfString(invoice.organization.address, { width: 220 });
        doc.text(invoice.organization.address, 50, orgY, { width: 220 });
        orgY += addrHeight;
      }

      // Invoice title and number (right side — always anchored to top)
      doc
        .fillColor(textColor)
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('INVOICE', 400, 50, { align: 'right' });

      doc
        .fillColor(mutedColor)
        .fontSize(11)
        .font('Helvetica')
        .text(invoice.invoiceNumber, 400, 78, { align: 'right' });

      // Align status terminology with web public link views
      const statusTexts: Record<string, string> = {
        DRAFT: 'NOT YET ISSUED',
        SENT: 'AWAITING PAYMENT',
        PAID: 'PAID IN FULL',
        PARTIALLY_PAID: 'PART PAID',
        OVERDUE: 'PAYMENT OVERDUE',
        CANCELLED: 'CANCELLED',
      };
      const statusColors: Record<string, string> = {
        DRAFT: mutedColor,
        SENT: primaryColor,
        PAID: successColor,
        PARTIALLY_PAID: primaryColor,
        OVERDUE: errorColor,
        CANCELLED: mutedColor,
      };

      const statusColor = statusColors[invoice.status] || mutedColor;
      const statusText = statusTexts[invoice.status] || invoice.status.replace('_', ' ').toUpperCase();

      doc
        .fillColor(statusColor)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(statusText, 400, 95, { align: 'right' });

      // Divider — thin, light, elegant, printer-friendly line
      const dividerY = Math.max(orgY + 15, 130);
      doc
        .strokeColor('#e2e8f0')
        .lineWidth(0.75)
        .moveTo(50, dividerY)
        .lineTo(545, dividerY)
        .stroke();

      // Bill To section
      const billToY = dividerY + 20;
      doc
        .fillColor(mutedColor)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('BILL TO', 50, billToY);

      doc
        .fillColor(textColor)
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(invoice.client.name, 50, billToY + 15);

      doc.fillColor(mutedColor).fontSize(9).font('Helvetica');

      let clientY = billToY + 30;
      if (invoice.client.email) {
        doc.text(invoice.client.email, 50, clientY);
        clientY += 13;
      }
      if (invoice.client.phone) {
        doc.text(invoice.client.phone, 50, clientY);
        clientY += 13;
      }
      if (invoice.client.address) {
        doc.text(invoice.client.address, 50, clientY, { width: 220 });
      }

      // Dates
      doc
        .fillColor(mutedColor)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('ISSUE DATE', 350, billToY)
        .text('DUE DATE', 450, billToY);

      doc
        .fillColor(textColor)
        .fontSize(9)
        .font('Helvetica')
        .text(this.formatDate(invoice.issueDate), 350, billToY + 15)
        .text(this.formatDate(invoice.dueDate), 450, billToY + 15);

      // Items table — redesigned with wider spacing to prevent numeric wrapping
      const tableTop = dividerY + 130;
      const tableHeaders = ['Description', 'Qty', 'Unit Price', 'Amount'];
      
      // Column configurations to prevent wrapping of large amounts (e.g. NGN 12,000,000.00)
      const columnWidths = [205, 35, 125, 130];
      const columnPositions = [50, 255, 290, 415];

      // Table header background (very soft tint, ink-friendly)
      doc
        .fillColor('#f8f9ff')
        .rect(50, tableTop, 495, 22)
        .fill();

      doc
        .fillColor(textColor)
        .fontSize(9)
        .font('Helvetica-Bold');

      tableHeaders.forEach((header, i) => {
        const align = i === 0 ? 'left' : 'right';
        const x = i === 0 ? columnPositions[i] + 8 : columnPositions[i];
        const width = columnWidths[i] - (i === 0 ? 8 : 0);
        doc.text(header, x, tableTop + 6, { width, align });
      });

      // Table rows
      let rowY = tableTop + 28;
      doc.font('Helvetica').fontSize(9);

      invoice.items.forEach((item, index) => {
        const rowHeight = 22;

        // Alternating row background for scanning readability
        if (index % 2 === 1) {
          doc
            .fillColor('#f8fafc')
            .rect(50, rowY - 4, 495, rowHeight)
            .fill();
        }

        doc.fillColor(textColor);

        // Description
        doc.text(item.description, columnPositions[0] + 8, rowY, {
          width: columnWidths[0] - 8
        });

        // Quantity
        doc.text(item.quantity.toString(), columnPositions[1], rowY, {
          width: columnWidths[1],
          align: 'right'
        });

        // Unit Price
        doc.text(this.formatCurrency(item.unitPrice), columnPositions[2], rowY, {
          width: columnWidths[2],
          align: 'right'
        });

        // Amount
        doc.text(this.formatCurrency(item.amount), columnPositions[3], rowY, {
          width: columnWidths[3],
          align: 'right'
        });

        rowY += rowHeight;
      });

      // Totals section
      const totalsY = rowY + 15;
      const totalsX = 350;
      const totalsWidth = 195;

      // Subtotal
      doc
        .fillColor(mutedColor)
        .fontSize(9)
        .text('Subtotal', totalsX, totalsY, { width: 100 });
      doc
        .fillColor(textColor)
        .text(this.formatCurrency(invoice.subtotal), totalsX + 100, totalsY, {
          width: 95,
          align: 'right'
        });

      let currentY = totalsY + 16;

      // Discount
      const discountAmt = Number(invoice.discountAmount || 0);
      const discountPct = Number(invoice.discountPercent || 0);
      if (discountAmt > 0) {
        doc
          .fillColor(successColor)
          .text(
            invoice.discountType === 'FIXED'
              ? `Discount`
              : `Discount (${discountPct}%)`,
            totalsX, currentY, { width: 100 },
          );
        doc
          .fillColor(successColor)
          .text(`-${this.formatCurrency(discountAmt)}`, totalsX + 100, currentY, {
            width: 95,
            align: 'right'
          });
        currentY += 16;
      }

      // VAT
      if (Number(invoice.taxAmount) > 0) {
        doc
          .fillColor(mutedColor)
          .text(`VAT (${invoice.taxRate ?? 7.5}%)`, totalsX, currentY, { width: 100 });
        doc
          .fillColor(textColor)
          .text(this.formatCurrency(invoice.taxAmount), totalsX + 100, currentY, {
            width: 95,
            align: 'right'
          });
        currentY += 16;
      }

      // Total Line
      doc
        .strokeColor('#e2e8f0')
        .lineWidth(0.5)
        .moveTo(totalsX, currentY)
        .lineTo(totalsX + totalsWidth, currentY)
        .stroke();

      currentY += 8;
      doc
        .fillColor(textColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Total', totalsX, currentY, { width: 100 });
      doc.text(this.formatCurrency(invoice.total), totalsX + 100, currentY, {
        width: 95,
        align: 'right'
      });

      // Amount paid and balance due
      if (Number(invoice.amountPaid) > 0) {
        currentY += 20;
        doc
          .fillColor(successColor)
          .fontSize(9)
          .font('Helvetica')
          .text('Amount Paid', totalsX, currentY, { width: 100 });
        doc.text(`-${this.formatCurrency(invoice.amountPaid)}`, totalsX + 100, currentY, {
          width: 95,
          align: 'right'
        });

        currentY += 16;
        const balanceDue = Number(invoice.total) - Number(invoice.amountPaid);
        doc
          .fillColor(textColor)
          .font('Helvetica-Bold')
          .text('Balance Due', totalsX, currentY, { width: 100 });
        doc.text(this.formatCurrency(balanceDue), totalsX + 100, currentY, {
          width: 95,
          align: 'right'
        });
      }

      // Render payment links asynchronously using helper
      const self = this;
      const balanceDue = Number(invoice.total) - Number(invoice.amountPaid);
      const unpaidInstallments = invoice.installments?.filter(inst => !inst.isPaid && inst.paymentUrl) || [];

      const renderPaymentLinks = async () => {
        if (unpaidInstallments.length > 0 && balanceDue > 0) {
          // World-class table style installment schedule
          let scheduleY = currentY + 30;
          doc
            .fillColor(textColor)
            .fontSize(10)
            .font('Helvetica-Bold')
            .text('PAYMENT SCHEDULE', 50, scheduleY);

          scheduleY += 15;

          for (const inst of unpaidInstallments) {
            const shortenedUrl = await self.tryShortenUrl(inst.paymentUrl!);

            // Soft gray line backplates for readability
            doc
              .fillColor('#f8f9ff')
              .rect(50, scheduleY - 4, 495, 22)
              .fill();

            doc
              .fillColor(textColor)
              .fontSize(8.5)
              .font('Helvetica-Bold')
              .text(`${inst.label} (${inst.percentage}%)`, 58, scheduleY);

            doc
              .fillColor(textColor)
              .font('Helvetica')
              .text(self.formatCurrency(inst.amount), 190, scheduleY, { width: 90, align: 'right' });

            doc
              .fillColor(primaryColor)
              .text('Pay Link: ', 295, scheduleY);

            doc
              .fillColor(primaryColor)
              .font('Helvetica-Bold')
              .text(shortenedUrl.replace(/^https?:\/\//, ''), 340, scheduleY, {
                link: inst.paymentUrl!,
                underline: true,
                width: 195
              });

            scheduleY += 24;
          }
          currentY = scheduleY;
        } else if (invoice.paymentUrl && balanceDue > 0) {
          // Elegant single payment callout strip
          const paymentY = currentY + 30;
          const shortenedUrl = await self.tryShortenUrl(invoice.paymentUrl);

          doc
            .fillColor('#f8f9ff')
            .rect(50, paymentY, 495, 32)
            .fill();

          doc
            .strokeColor(primaryColor)
            .lineWidth(0.5)
            .rect(50, paymentY, 495, 32)
            .stroke();

          doc
            .fillColor(textColor)
            .fontSize(9)
            .font('Helvetica-Bold')
            .text('SECURE ONLINE PAYMENT', 65, paymentY + 11);

          doc
            .fillColor(primaryColor)
            .fontSize(8.5)
            .font('Helvetica')
            .text('Link: ', 220, paymentY + 11);

          doc
            .fillColor(primaryColor)
            .font('Helvetica-Bold')
            .text(shortenedUrl.replace(/^https?:\/\//, ''), 248, paymentY + 11, {
              link: invoice.paymentUrl,
              underline: true,
              width: 280
            });

          currentY = paymentY + 40;
        }

        // Notes section
        if (invoice.notes) {
          const notesY = Math.max(currentY + 25, 540);
          doc
            .fillColor(mutedColor)
            .fontSize(9)
            .font('Helvetica-Bold')
            .text('NOTES', 50, notesY);

          doc
            .fillColor(textColor)
            .fontSize(9)
            .font('Helvetica')
            .text(invoice.notes, 50, notesY + 13, { width: 240 });
        }

        // Terms section
        if (invoice.terms) {
          const termsY = Math.max(currentY + 25, 540);
          doc
            .fillColor(mutedColor)
            .fontSize(9)
            .font('Helvetica-Bold')
            .text('TERMS & CONDITIONS', 310, termsY);

          doc
            .fillColor(textColor)
            .fontSize(9)
            .font('Helvetica')
            .text(invoice.terms, 310, termsY + 13, { width: 235 });
        }

        // Footer — Tari1 Logo + Branding
        const footerY = doc.page.height - doc.page.margins.bottom - 45;

        if (qrBuffer) {
          // Scan QR bottom right
          doc.image(qrBuffer, 465, footerY - 90, { width: 80, height: 80 });
        }

        doc
          .strokeColor('#e2e8f0')
          .lineWidth(0.5)
          .moveTo(50, footerY)
          .lineTo(545, footerY)
          .stroke();

        // Load Tari1 Logo safely from client package asset directory
        let tari1LogoBuffer: Buffer | null = null;
        try {
          const logoPath = path.resolve(process.cwd(), '../client/public/logo.png');
          if (fs.existsSync(logoPath)) {
            tari1LogoBuffer = fs.readFileSync(logoPath);
          }
        } catch {
          // Skip if local logo can't be fetched
        }

        if (tari1LogoBuffer) {
          // Center-align Tari1 logo in the footer
          doc.image(tari1LogoBuffer, 255, footerY + 10, { height: 16 });
          
          if (!isPro) {
            doc
              .fillColor('#94a3b8')
              .fontSize(7.5)
              .font('Helvetica')
              .text('Powered by Tari1', 50, footerY + 28, {
                width: 495,
                align: 'center',
              });
          }
        } else {
          // Fallback to text logo if image loading fails
          doc
            .fillColor(primaryColor)
            .fontSize(10)
            .font('Helvetica-Bold')
            .text('Tari1', 50, footerY + 10, {
              width: 495,
              align: 'center',
            });
          
          if (!isPro) {
            doc
              .fillColor('#94a3b8')
              .fontSize(7.5)
              .font('Helvetica')
              .text('Powered by Tari1', 50, footerY + 22, {
                width: 495,
                align: 'center',
              });
          }
        }

        doc.end();
      };

      // Execute PDF builders after finalizing URLs
      renderPaymentLinks().catch(reject);
    });
  }

  private async tryShortenUrl(targetUrl: string): Promise<string> {
    if (!targetUrl) return '';
    try {
      // Check if short link already exists for this URL
      let shortLink = await this.prisma.shortLink.findFirst({
        where: { targetUrl },
      });

      if (!shortLink) {
        // Generate a unique slug
        let slug = '';
        let isUnique = false;
        while (!isUnique) {
          slug = Math.random().toString(36).substring(2, 7); // 5-character alphanumeric slug
          const existing = await this.prisma.shortLink.findUnique({
            where: { slug },
          });
          if (!existing) {
            isUnique = true;
          }
        }

        shortLink = await this.prisma.shortLink.create({
          data: {
            slug,
            targetUrl,
          },
        });
      }

      // Read frontendUrl from configService
      const frontendUrl = this.configService.get<string>('resend.frontendUrl') || 'http://localhost:5173';
      // Clean trailing slash if present
      const baseUrl = frontendUrl.replace(/\/$/, '');
      return `${baseUrl}/p/${shortLink.slug}`;
    } catch (err) {
      console.error('Error generating short link in PDF service, falling back to original:', err);
      return targetUrl;
    }
  }

  private fetchImageBuffer(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  private formatCurrency(amount: number | string): string {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    const formatted = new Intl.NumberFormat('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
    return `NGN ${formatted}`;
  }
}
