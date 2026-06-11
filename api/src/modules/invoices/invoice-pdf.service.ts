import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as https from 'https';
import * as http from 'http';
import * as QRCode from 'qrcode';

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
  async generatePdf(invoice: InvoiceData): Promise<Buffer> {
    // Paying PRO/BUSINESS orgs don't show "Powered by Tari1"; FREE and trialing orgs do
    const isPayingPro = (invoice.organization.planTier === 'PRO' || invoice.organization.planTier === 'BUSINESS')
      && invoice.organization.subscriptionStatus !== 'TRIALING';
    const isPro = isPayingPro;

    let logoBuffer: Buffer | null = null;
    if (isPro && invoice.organization.logo) {
      try {
        logoBuffer = await this.fetchImageBuffer(invoice.organization.logo);
      } catch {
        // Skip if logo can't be loaded
      }
    }

    let qrBuffer: Buffer | null = null;
    if (invoice.organization.showQrCode && invoice.organization.address) {
      try {
        qrBuffer = await QRCode.toBuffer(invoice.organization.address, { width: 80, margin: 1 });
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

      // Colors
      const primaryColor = '#0f172a';
      const textColor = '#1e293b';
      const mutedColor = '#64748b';

      // Header - Logo + Organization name (left side)
      let orgY = 50;
      if (logoBuffer) {
        doc.image(logoBuffer, 50, orgY, { fit: [120, 40] });
        orgY += 48;
      }

      doc
        .fillColor(primaryColor)
        .fontSize(logoBuffer ? 14 : 24)
        .font('Helvetica-Bold')
        .text(invoice.organization.name, 50, orgY);
      orgY += logoBuffer ? 18 : 28;

      doc.fillColor(mutedColor).fontSize(10).font('Helvetica');

      if (invoice.organization.email) {
        doc.text(invoice.organization.email, 50, orgY);
        orgY += 14;
      }
      if (invoice.organization.phone) {
        doc.text(invoice.organization.phone, 50, orgY);
        orgY += 14;
      }
      if (invoice.organization.address) {
        const addrHeight = doc.heightOfString(invoice.organization.address, { width: 200 });
        doc.text(invoice.organization.address, 50, orgY, { width: 200 });
        orgY += addrHeight;
      }

      // Invoice title and number (right side — always anchored to top)
      doc
        .fillColor(textColor)
        .fontSize(28)
        .font('Helvetica-Bold')
        .text('INVOICE', 400, 50, { align: 'right' });

      doc
        .fillColor(mutedColor)
        .fontSize(12)
        .font('Helvetica')
        .text(invoice.invoiceNumber, 400, 85, { align: 'right' });

      const statusColors: Record<string, string> = {
        DRAFT: '#64748b',
        SENT: '#3b82f6',
        PAID: '#10b981',
        PARTIALLY_PAID: '#f59e0b',
        OVERDUE: '#ef4444',
        CANCELLED: '#64748b',
      };
      const statusColor = statusColors[invoice.status] || '#64748b';
      const statusText = invoice.status.replace('_', ' ');

      doc
        .fillColor(statusColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(statusText, 400, 105, { align: 'right' });

      // Divider — always below the tallest side of the header
      const dividerY = Math.max(orgY + 15, 130);
      doc
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .moveTo(50, dividerY)
        .lineTo(545, dividerY)
        .stroke();

      // Bill To section
      const billToY = dividerY + 20;
      doc
        .fillColor(mutedColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('BILL TO', 50, billToY);

      doc
        .fillColor(textColor)
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(invoice.client.name, 50, billToY + 18);

      doc.fillColor(mutedColor).fontSize(10).font('Helvetica');

      let clientY = billToY + 35;
      if (invoice.client.email) {
        doc.text(invoice.client.email, 50, clientY);
        clientY += 14;
      }
      if (invoice.client.phone) {
        doc.text(invoice.client.phone, 50, clientY);
        clientY += 14;
      }
      if (invoice.client.address) {
        doc.text(invoice.client.address, 50, clientY, { width: 200 });
      }

      // Dates
      doc
        .fillColor(mutedColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('ISSUE DATE', 350, billToY)
        .text('DUE DATE', 450, billToY);

      doc
        .fillColor(textColor)
        .fontSize(10)
        .font('Helvetica')
        .text(this.formatDate(invoice.issueDate), 350, billToY + 18)
        .text(this.formatDate(invoice.dueDate), 450, billToY + 18);

      // Items table — starts 130px below the divider (enough room for client info)
      const tableTop = dividerY + 130;
      const tableHeaders = ['Description', 'Qty', 'Unit Price', 'Amount'];
      const columnWidths = [250, 60, 100, 85];
      const columnPositions = [50, 300, 360, 460];

      // Table header
      doc
        .fillColor('#f1f5f9')
        .rect(50, tableTop, 495, 25)
        .fill();

      doc
        .fillColor(textColor)
        .fontSize(10)
        .font('Helvetica-Bold');

      tableHeaders.forEach((header, i) => {
        const align = i === 0 ? 'left' : 'right';
        const x = i === 0 ? columnPositions[i] + 10 : columnPositions[i];
        const width = columnWidths[i] - (i === 0 ? 10 : 0);
        doc.text(header, x, tableTop + 8, { width, align });
      });

      // Table rows
      let rowY = tableTop + 35;
      doc.font('Helvetica').fontSize(10);

      invoice.items.forEach((item, index) => {
        const rowHeight = 25;

        // Alternating row background
        if (index % 2 === 1) {
          doc
            .fillColor('#f8fafc')
            .rect(50, rowY - 5, 495, rowHeight)
            .fill();
        }

        doc.fillColor(textColor);

        // Description
        doc.text(item.description, columnPositions[0] + 10, rowY, {
          width: columnWidths[0] - 10
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
      const totalsY = rowY + 20;
      const totalsX = 360;
      const totalsWidth = 185;

      // Subtotal
      doc
        .fillColor(mutedColor)
        .text('Subtotal', totalsX, totalsY, { width: 100 });
      doc
        .fillColor(textColor)
        .text(this.formatCurrency(invoice.subtotal), totalsX + 100, totalsY, {
          width: 85,
          align: 'right'
        });

      let currentY = totalsY + 20;

      // Discount (if applicable)
      const discountAmt = Number(invoice.discountAmount || 0);
      const discountPct = Number(invoice.discountPercent || 0);
      if (discountAmt > 0) {
        doc
          .fillColor('#10b981') // Green for discount
          .text(
            invoice.discountType === 'FIXED'
              ? `Discount (${this.formatCurrency(discountPct)})`
              : `Discount (${discountPct}%)`,
            totalsX, currentY, { width: 100 },
          );
        doc
          .fillColor('#10b981')
          .text(`-${this.formatCurrency(discountAmt)}`, totalsX + 100, currentY, {
            width: 85,
            align: 'right'
          });
        currentY += 20;
      }

      // VAT (7.5%)
      if (Number(invoice.taxAmount) > 0) {
        doc
          .fillColor(mutedColor)
          .text(`VAT (${invoice.taxRate ?? 7.5}%)`, totalsX, currentY, { width: 100 });
        doc
          .fillColor(textColor)
          .text(this.formatCurrency(invoice.taxAmount), totalsX + 100, currentY, {
            width: 85,
            align: 'right'
          });
        currentY += 20;
      }

      // Total
      doc
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .moveTo(totalsX, currentY)
        .lineTo(totalsX + totalsWidth, currentY)
        .stroke();

      currentY += 10;
      doc
        .fillColor(textColor)
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Total', totalsX, currentY, { width: 100 });
      doc.text(this.formatCurrency(invoice.total), totalsX + 100, currentY, {
        width: 85,
        align: 'right'
      });

      // Amount paid and balance due
      if (Number(invoice.amountPaid) > 0) {
        currentY += 25;
        doc
          .fillColor('#10b981')
          .fontSize(10)
          .font('Helvetica')
          .text('Amount Paid', totalsX, currentY, { width: 100 });
        doc.text(`-${this.formatCurrency(invoice.amountPaid)}`, totalsX + 100, currentY, {
          width: 85,
          align: 'right'
        });

        currentY += 20;
        const balanceDue = Number(invoice.total) - Number(invoice.amountPaid);
        doc
          .fillColor(textColor)
          .font('Helvetica-Bold')
          .text('Balance Due', totalsX, currentY, { width: 100 });
        doc.text(this.formatCurrency(balanceDue), totalsX + 100, currentY, {
          width: 85,
          align: 'right'
        });
      }

      // Payment Link section (if available and not fully paid)
      const balanceDue = Number(invoice.total) - Number(invoice.amountPaid);

      // Check for installment-based payments first
      const unpaidInstallments = invoice.installments?.filter(inst => !inst.isPaid && inst.paymentUrl) || [];

      if (unpaidInstallments.length > 0 && balanceDue > 0) {
        // Render multiple installment payment boxes
        let paymentBoxY = currentY + 40;
        const boxHeight = 55;
        const boxWidth = 250;

        for (const inst of unpaidInstallments) {
          // Draw payment box background
          doc
            .fillColor('#f1f5f9') // Light grey background
            .roundedRect(50, paymentBoxY, boxWidth, boxHeight, 8)
            .fill();

          // Payment box border
          doc
            .strokeColor(primaryColor)
            .lineWidth(1)
            .roundedRect(50, paymentBoxY, boxWidth, boxHeight, 8)
            .stroke();

          // Payment label with installment name
          doc
            .fillColor(primaryColor)
            .fontSize(10)
            .font('Helvetica-Bold')
            .text(`${inst.label} (${inst.percentage}%)`, 65, paymentBoxY + 10);

          // Amount
          doc
            .fillColor(textColor)
            .fontSize(9)
            .font('Helvetica')
            .text(`Amount: ${this.formatCurrency(inst.amount)}`, 65, paymentBoxY + 24);

          // Clickable link
          doc
            .fillColor(primaryColor)
            .fontSize(9)
            .font('Helvetica')
            .text('Click to pay via Paystack', 65, paymentBoxY + 38, {
              link: inst.paymentUrl!,
              underline: true,
            });

          paymentBoxY += boxHeight + 10;
        }

        currentY = paymentBoxY;
      } else if (invoice.paymentUrl && balanceDue > 0) {
        // Single payment link (no installments)
        const paymentBoxY = currentY + 40;
        const boxHeight = 60;
        const boxWidth = 250;

        // Draw payment box background
        doc
          .fillColor('#f1f5f9') // Light grey background
          .roundedRect(50, paymentBoxY, boxWidth, boxHeight, 8)
          .fill();

        // Payment box border
        doc
          .strokeColor(primaryColor)
          .lineWidth(1)
          .roundedRect(50, paymentBoxY, boxWidth, boxHeight, 8)
          .stroke();

        // Payment icon/label
        doc
          .fillColor(primaryColor)
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('PAY ONLINE', 65, paymentBoxY + 12);

        // Amount
        doc
          .fillColor(textColor)
          .fontSize(10)
          .font('Helvetica')
          .text(`Amount Due: ${this.formatCurrency(balanceDue)}`, 65, paymentBoxY + 28);

        // Clickable link
        doc
          .fillColor(primaryColor)
          .fontSize(9)
          .font('Helvetica')
          .text('Click here to pay securely via Paystack', 65, paymentBoxY + 43, {
            link: invoice.paymentUrl,
            underline: true,
          });

        currentY = paymentBoxY + boxHeight;
      }

      // Notes section
      if (invoice.notes) {
        const notesY = Math.max(currentY + 30, 550);
        doc
          .fillColor(mutedColor)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('NOTES', 50, notesY);

        doc
          .fillColor(textColor)
          .fontSize(10)
          .font('Helvetica')
          .text(invoice.notes, 50, notesY + 15, { width: 250 });
      }

      // Terms section
      if (invoice.terms) {
        const termsY = Math.max(currentY + 30, 550);
        doc
          .fillColor(mutedColor)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('TERMS & CONDITIONS', 320, termsY);

        doc
          .fillColor(textColor)
          .fontSize(10)
          .font('Helvetica')
          .text(invoice.terms, 320, termsY + 15, { width: 225 });
      }

      // Footer — positioned safely above the bottom margin to avoid triggering a new page
      const footerY = doc.page.height - doc.page.margins.bottom - 40;

      if (qrBuffer) {
        // QR code bottom-right, sitting just above the footer line
        doc.image(qrBuffer, 465, footerY - 90, { width: 80, height: 80 });
      }

      doc
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .moveTo(50, footerY)
        .lineTo(545, footerY)
        .stroke();

      doc
        .fillColor(mutedColor)
        .fontSize(9)
        .font('Helvetica')
        .text('Thank you for your business!', 50, footerY + 10, {
          width: 495,
          align: 'center'
        });

      if (!isPro) {
        doc
          .fillColor('#94a3b8')
          .fontSize(8)
          .font('Helvetica')
          .text('Powered by Tari1', 50, footerY + 24, {
            width: 495,
            align: 'center',
          });
      }

      doc.end();
    });
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
