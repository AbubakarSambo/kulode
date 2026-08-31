import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

interface ShiftReportData {
  id: string;
  status: string;
  openingFloat: number;
  expectedCash?: number | null;
  countedCash?: number | null;
  variance?: number | null;
  notes?: string | null;
  openedAt: Date;
  closedAt?: Date | null;
  openedBy?: { firstName: string; lastName: string } | null;
  closedBy?: { firstName: string; lastName: string } | null;
  breakdowns: Array<{ paymentMethod: string; expectedAmount: number; countedAmount: number; variance: number }>;
  categoryTotals: Array<{ category: string; amount: number }>;
  taxTotals: {
    vatAmount: number;
    entertainmentTaxAmount: number;
    serviceChargeAmount: number;
    vatRate: number;
    entertainmentTaxRate: number;
    serviceChargeRate: number;
  };
  organization: { name: string; address?: string | null; phone?: string | null; currency: string };
}

const RECEIPT_WIDTH = 226; // ~80mm at 72dpi

@Injectable()
export class ShiftReportPdfService {
  async generatePdf(shift: ShiftReportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: [RECEIPT_WIDTH, 792],
        margin: 12,
        info: { Title: `Shift Report ${shift.id.slice(0, 8)}`, Author: shift.organization.name },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const width = RECEIPT_WIDTH - 24;
      const center = { width, align: 'center' as const };
      const currency = shift.organization.currency;

      doc.font('Helvetica-Bold').fontSize(11).text(shift.organization.name, center);
      doc.font('Helvetica').fontSize(8);
      if (shift.organization.address) doc.text(shift.organization.address, center);
      if (shift.organization.phone) doc.text(shift.organization.phone, center);
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(10).text('SHIFT REPORT', center);
      doc.font('Helvetica').fontSize(8);
      this.divider(doc, width);

      doc.text(`Shift: ${shift.id.slice(0, 8).toUpperCase()}`, { width });
      doc.text(`Opened: ${this.formatDate(shift.openedAt)}`, { width });
      if (shift.openedBy) doc.text(`Opened by: ${shift.openedBy.firstName} ${shift.openedBy.lastName}`, { width });
      if (shift.closedAt) doc.text(`Closed: ${this.formatDate(shift.closedAt)}`, { width });
      if (shift.closedBy) doc.text(`Closed by: ${shift.closedBy.firstName} ${shift.closedBy.lastName}`, { width });
      this.divider(doc, width);

      this.row(doc, width, 'Opening Float', this.formatCurrency(shift.openingFloat, currency));
      this.divider(doc, width);

      if (shift.categoryTotals.length > 0) {
        doc.font('Helvetica-Bold').fontSize(8).text('Items Detail', { width });
        doc.font('Helvetica');
        let totalItems = 0;
        for (const { category, amount } of shift.categoryTotals) {
          totalItems += amount;
          this.row(doc, width, category, this.formatCurrency(amount, currency));
        }
        doc.font('Helvetica-Bold');
        this.row(doc, width, 'Total Items', this.formatCurrency(totalItems, currency));
        doc.font('Helvetica');
        this.divider(doc, width);
      }

      const { vatAmount, entertainmentTaxAmount, serviceChargeAmount, vatRate, entertainmentTaxRate, serviceChargeRate } =
        shift.taxTotals;
      if (vatAmount || entertainmentTaxAmount || serviceChargeAmount) {
        doc.font('Helvetica-Bold').fontSize(8).text('Taxes Detail', { width });
        doc.font('Helvetica');
        if (vatAmount) this.row(doc, width, `VAT ${vatRate}%`, this.formatCurrency(vatAmount, currency));
        if (entertainmentTaxAmount)
          this.row(doc, width, `Ent. Tax ${entertainmentTaxRate}%`, this.formatCurrency(entertainmentTaxAmount, currency));
        if (serviceChargeAmount)
          this.row(doc, width, `Service ${serviceChargeRate}%`, this.formatCurrency(serviceChargeAmount, currency));
        doc.font('Helvetica-Bold');
        this.row(
          doc,
          width,
          'Total Tax',
          this.formatCurrency(vatAmount + entertainmentTaxAmount + serviceChargeAmount, currency),
        );
        doc.font('Helvetica');
        this.divider(doc, width);
      }

      let totalExpected = 0;
      let totalCounted = 0;
      for (const [index, row] of shift.breakdowns.entries()) {
        totalExpected += row.expectedAmount;
        totalCounted += row.countedAmount;

        if (index > 0) doc.moveDown(0.3);
        doc.font('Helvetica-Bold').fontSize(8).text(row.paymentMethod, 12, doc.y, { width });
        doc.font('Helvetica').fontSize(7).fillColor('#555');
        this.row(doc, width, 'Expected', this.formatCurrency(row.expectedAmount, currency));
        doc.fontSize(8).fillColor('#000');
        this.row(doc, width, 'Counted', this.formatCurrency(row.countedAmount, currency));
        this.row(doc, width, 'Diff', this.formatVariance(row.variance, currency));
      }
      this.divider(doc, width);

      doc.font('Helvetica-Bold');
      this.row(doc, width, 'Total Counted', this.formatCurrency(totalCounted, currency));
      this.row(doc, width, 'Total Expected', this.formatCurrency(totalExpected, currency));
      this.row(doc, width, 'Total Diff', this.formatVariance(totalCounted - totalExpected, currency));
      doc.font('Helvetica');

      if (shift.notes) {
        this.divider(doc, width);
        doc.fontSize(8).text(`Notes: ${shift.notes}`, 12, doc.y, { width });
      }

      doc.moveDown(1);
      doc.fontSize(8).text('*****', 12, doc.y, center);

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
    // Explicit, independently-positioned label/value boxes rather than PDFKit's `continued`
    // text chaining — shift totals run into the millions of Naira, and `continued` reserves
    // space based on the label's *rendered* width, not the box width, so a long value can get
    // squeezed and wrap unpredictably depending on label length/weight.
    const y = doc.y;
    const labelWidth = width * 0.45;
    doc.text(label, 12, y, { width: labelWidth });
    doc.text(value, 12 + labelWidth, y, { width: width - labelWidth, align: 'right' });
    doc.y = y + doc.currentLineHeight();
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

  private formatVariance(amount: number, currency: string): string {
    const sign = amount > 0 ? '+' : '';
    return `${sign}${this.formatCurrency(amount, currency)}`;
  }
}
