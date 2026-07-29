import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

interface OrderReceiptData {
  receiptNumber: string;
  createdAt: Date;
  closedAt?: Date | null;
  source: string;
  table?: { name: string } | null;
  items: Array<{ name: string; quantity: number; unitPrice: number; amount: number; notes?: string | null }>;
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  payments: Array<{ amount: number; paymentMethod: string; paymentDate: Date }>;
  organization: { name: string; email?: string | null; phone?: string | null; address?: string | null; currency: string };
}

const RECEIPT_WIDTH = 226; // ~80mm at 72dpi

@Injectable()
export class OrderReceiptPdfService {
  async generatePdf(receipt: OrderReceiptData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: [RECEIPT_WIDTH, 792], // fixed narrow width, tall enough for most orders
        margin: 12,
        info: { Title: `Receipt ${receipt.receiptNumber}`, Author: receipt.organization.name },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const width = RECEIPT_WIDTH - 24;
      const center = { width, align: 'center' as const };

      doc.font('Helvetica-Bold').fontSize(11).text(receipt.organization.name, center);
      doc.font('Helvetica').fontSize(8);
      if (receipt.organization.address) doc.text(receipt.organization.address, center);
      if (receipt.organization.phone) doc.text(receipt.organization.phone, center);
      doc.moveDown(0.5);
      this.divider(doc, width);

      doc.fontSize(8);
      doc.text(`Receipt: ${receipt.receiptNumber}`, { width });
      doc.text(`Date: ${this.formatDate(receipt.closedAt ?? receipt.createdAt)}`, { width });
      doc.text(`Source: ${receipt.source.replace('_', ' ')}`, { width });
      if (receipt.table) doc.text(`Table: ${receipt.table.name}`, { width });
      this.divider(doc, width);

      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('ITEM', 12, doc.y, { continued: true, width: width * 0.55 });
      doc.text('QTY', { continued: true, width: width * 0.15, align: 'right' });
      doc.text('AMT', { width: width * 0.3, align: 'right' });
      doc.font('Helvetica');

      for (const item of receipt.items) {
        doc.text(item.name, 12, doc.y, { continued: true, width: width * 0.55 });
        doc.text(String(item.quantity), { continued: true, width: width * 0.15, align: 'right' });
        doc.text(this.formatCurrency(item.amount, receipt.organization.currency), { width: width * 0.3, align: 'right' });
        if (item.notes) {
          doc.fontSize(7).fillColor('#555').text(`  ${item.notes}`, { width });
          doc.fontSize(8).fillColor('#000');
        }
      }
      this.divider(doc, width);

      this.row(doc, width, 'Subtotal', this.formatCurrency(receipt.subtotal, receipt.organization.currency));
      if (receipt.taxAmount > 0) {
        this.row(doc, width, 'Tax', this.formatCurrency(receipt.taxAmount, receipt.organization.currency));
      }
      doc.font('Helvetica-Bold');
      this.row(doc, width, 'TOTAL', this.formatCurrency(receipt.total, receipt.organization.currency));
      doc.font('Helvetica');
      this.divider(doc, width);

      for (const payment of receipt.payments) {
        this.row(
          doc,
          width,
          `Paid (${payment.paymentMethod.replace('_', ' ')})`,
          this.formatCurrency(payment.amount, receipt.organization.currency),
        );
      }

      doc.moveDown(1);
      doc.fontSize(8).text('Thank you!', center);

      doc.end();
    });
  }

  private divider(doc: PDFKit.PDFDocument, width: number) {
    doc.moveDown(0.3);
    doc
      .strokeColor('#000')
      .lineWidth(0.5)
      .moveTo(12, doc.y)
      .lineTo(12 + width, doc.y)
      .stroke();
    doc.moveDown(0.3);
  }

  private row(doc: PDFKit.PDFDocument, width: number, label: string, value: string) {
    doc.text(label, 12, doc.y, { continued: true, width: width * 0.6 });
    doc.text(value, { width: width * 0.4, align: 'right' });
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatCurrency(amount: number, currency: string): string {
    return `${currency} ${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
