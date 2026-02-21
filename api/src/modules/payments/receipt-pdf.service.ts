import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

interface ReceiptData {
  receiptNumber: string;
  paymentDate: Date;
  amount: number;
  paymentMethod: string;
  reference?: string | null;
  notes?: string | null;
  invoice: {
    invoiceNumber: string;
    total: number;
  };
  client: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };
  organization: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };
}

@Injectable()
export class ReceiptPdfService {
  async generatePdf(receipt: ReceiptData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Receipt ${receipt.receiptNumber}`,
          Author: receipt.organization.name,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Colors
      const primaryColor = '#0f172a';
      const textColor = '#1e293b';
      const mutedColor = '#64748b';
      const successColor = '#10b981';

      // Header - Organization info
      doc
        .fillColor(primaryColor)
        .fontSize(24)
        .font('Helvetica-Bold')
        .text(receipt.organization.name, 50, 50, { width: 260, lineBreak: true });

      doc.fillColor(mutedColor).fontSize(10).font('Helvetica');

      let yPos = doc.y + 6;
      if (receipt.organization.email) {
        doc.text(receipt.organization.email, 50, yPos, { width: 260 });
        yPos += 14;
      }
      if (receipt.organization.phone) {
        doc.text(receipt.organization.phone, 50, yPos, { width: 260 });
        yPos += 14;
      }
      if (receipt.organization.address) {
        doc.text(receipt.organization.address, 50, yPos, { width: 260 });
      }

      // Receipt title (right-aligned in box from 345 to 545)
      doc
        .fillColor(textColor)
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('PAYMENT RECEIPT', 345, 50, { align: 'right', width: 200 });

      doc
        .fillColor(mutedColor)
        .fontSize(10)
        .font('Helvetica')
        .text(receipt.receiptNumber, 345, 78, { align: 'right', width: 200 });

      // Paid badge
      doc
        .fillColor(successColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('PAID', 345, 96, { align: 'right', width: 200 });

      // Divider
      doc
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .moveTo(50, 150)
        .lineTo(545, 150)
        .stroke();

      // Received From section
      doc
        .fillColor(mutedColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('RECEIVED FROM', 50, 170);

      doc
        .fillColor(textColor)
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(receipt.client.name, 50, 188);

      doc.fillColor(mutedColor).fontSize(10).font('Helvetica');

      yPos = 205;
      if (receipt.client.email) {
        doc.text(receipt.client.email, 50, yPos);
        yPos += 14;
      }
      if (receipt.client.phone) {
        doc.text(receipt.client.phone, 50, yPos);
        yPos += 14;
      }
      if (receipt.client.address) {
        doc.text(receipt.client.address, 50, yPos, { width: 200 });
      }

      // Payment details
      doc
        .fillColor(mutedColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('PAYMENT DATE', 350, 170)
        .text('PAYMENT METHOD', 450, 170);

      doc
        .fillColor(textColor)
        .fontSize(10)
        .font('Helvetica')
        .text(this.formatDate(receipt.paymentDate), 350, 188)
        .text(receipt.paymentMethod.replace('_', ' '), 450, 188);

      // Payment details box
      const boxY = 280;
      const boxHeight = 140;

      // Box background
      doc.fillColor('#f8fafc').rect(50, boxY, 495, boxHeight).fill();

      // Box border
      doc
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .rect(50, boxY, 495, boxHeight)
        .stroke();

      // Invoice reference
      doc
        .fillColor(mutedColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('FOR INVOICE', 70, boxY + 20);

      doc
        .fillColor(textColor)
        .fontSize(14)
        .font('Helvetica')
        .text(receipt.invoice.invoiceNumber, 70, boxY + 38);

      // Invoice total
      doc
        .fillColor(mutedColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('INVOICE TOTAL', 250, boxY + 20);

      doc
        .fillColor(textColor)
        .fontSize(14)
        .font('Helvetica')
        .text(this.formatCurrency(receipt.invoice.total), 250, boxY + 38);

      // Payment reference (if exists)
      if (receipt.reference) {
        doc
          .fillColor(mutedColor)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('REFERENCE', 400, boxY + 20);

        doc
          .fillColor(textColor)
          .fontSize(11)
          .font('Helvetica')
          .text(receipt.reference, 400, boxY + 38, { width: 125 });
      }

      // Amount paid - highlighted
      doc
        .fillColor(successColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('AMOUNT PAID', 70, boxY + 80);

      doc
        .fillColor(successColor)
        .fontSize(24)
        .font('Helvetica-Bold')
        .text(this.formatCurrency(receipt.amount), 70, boxY + 98);

      // Notes section
      if (receipt.notes) {
        const notesY = boxY + boxHeight + 30;
        doc
          .fillColor(mutedColor)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('NOTES', 50, notesY);

        doc
          .fillColor(textColor)
          .fontSize(10)
          .font('Helvetica')
          .text(receipt.notes, 50, notesY + 15, { width: 495 });
      }

      // Footer
      const footerY = 700;
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
        .text('Thank you for your payment!', 50, footerY + 10, {
          width: 495,
          align: 'center',
        });

      doc
        .fillColor(mutedColor)
        .fontSize(8)
        .text(
          'This is an electronically generated receipt and does not require a signature.',
          50,
          footerY + 30,
          { width: 495, align: 'center' },
        );

      doc.end();
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
