import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

interface OrderReceiptData {
  receiptNumber: string;
  createdAt: Date;
  closedAt?: Date | null;
  source: string;
  table?: { name: string } | null;
  customer?: { name: string; phone?: string | null } | null;
  items: Array<{ name: string; quantity: number; unitPrice: number; amount: number; notes?: string | null }>;
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  payments: Array<{ amount: number; paymentMethod: string; paymentDate: Date }>;
  waiter?: { firstName: string; lastName: string } | null;
  discountAmount?: number;
  vatApplied?: boolean;
  vatRate?: number;
  vatAmount?: number;
  entertainmentTaxApplied?: boolean;
  entertainmentTaxRate?: number;
  entertainmentTaxAmount?: number;
  serviceChargeApplied?: boolean;
  serviceChargeRate?: number;
  serviceChargeAmount?: number;
  // A guest's card/transfer tip — its own line below the total, never part of it.
  tipAmount?: number;
  organization: { name: string; email?: string | null; phone?: string | null; address?: string | null; currency: string };
}

const RECEIPT_WIDTH = 226; // ~80mm at 72dpi
const MARGIN = 12;

@Injectable()
export class OrderReceiptPdfService {
  async generatePdf(receipt: OrderReceiptData): Promise<Buffer> {
    // The page is as tall as the receipt, not a fixed sheet with a blank area underneath: lay it
    // out once on a tall scratch page to measure it, then again on a page of exactly that height.
    const scratch = new PDFDocument({ size: [RECEIPT_WIDTH, 20000], margin: MARGIN });
    scratch.on('data', () => undefined);
    const bottom = this.draw(scratch, receipt);
    scratch.end();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: [RECEIPT_WIDTH, Math.ceil(bottom + MARGIN)],
        margin: MARGIN,
        info: { Title: `Receipt ${receipt.receiptNumber}`, Author: receipt.organization.name },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      this.draw(doc, receipt);
      doc.end();
    });
  }

  /** Draws the whole receipt and returns the y position just below it. */
  private draw(doc: PDFKit.PDFDocument, receipt: OrderReceiptData): number {
    const width = RECEIPT_WIDTH - MARGIN * 2;
    const center = { width, align: 'center' as const };
    const cur = receipt.organization.currency || 'NGN';
    const money = (n: number) => this.formatCurrency(n, cur);

    doc.font('Helvetica-Bold').fontSize(12).text(receipt.organization.name, MARGIN, MARGIN, center);
    doc.font('Helvetica').fontSize(8);
    if (receipt.organization.address) doc.text(receipt.organization.address, MARGIN, doc.y, center);
    if (receipt.organization.phone) doc.text(receipt.organization.phone, MARGIN, doc.y, center);
    this.divider(doc, width);

    doc.fontSize(8);
    const meta: Array<[string, string]> = [
      ['Receipt', receipt.receiptNumber],
      ['Date', this.formatDate(receipt.closedAt ?? receipt.createdAt)],
      ['Source', this.titleCase(receipt.source)],
    ];
    if (receipt.table) meta.push(['Table', receipt.table.name]);
    if (receipt.waiter) meta.push(['Served by', `${receipt.waiter.firstName} ${receipt.waiter.lastName}`.trim()]);
    if (receipt.customer) meta.push(['Customer', receipt.customer.name]);
    if (receipt.customer?.phone) meta.push(['Phone', receipt.customer.phone]);
    for (const [label, value] of meta) this.row(doc, width, label, value, 0.28);
    this.divider(doc, width);

    // Item table. Amounts are plain numbers (the page says which currency); every column has a
    // fixed x and width, so nothing wraps into the next one.
    const qtyW = 24;
    const amtW = 62;
    const nameW = width - qtyW - amtW - 6;
    const qtyX = MARGIN + nameW + 3;
    const amtX = qtyX + qtyW + 3;

    doc.font('Helvetica-Bold').fontSize(7.5);
    let y = doc.y;
    doc.text('ITEM', MARGIN, y, { width: nameW });
    doc.text('QTY', qtyX, y, { width: qtyW, align: 'right' });
    doc.text(`AMOUNT (${cur})`, amtX - 20, y, { width: amtW + 20, align: 'right' });
    doc.y = y + doc.currentLineHeight() + 3;
    doc.font('Helvetica').fontSize(8);

    for (const item of receipt.items) {
      y = doc.y;
      const nameH = doc.heightOfString(item.name, { width: nameW });
      doc.text(item.name, MARGIN, y, { width: nameW });
      doc.text(String(item.quantity), qtyX, y, { width: qtyW, align: 'right' });
      doc.text(this.formatNumber(item.amount), amtX, y, { width: amtW, align: 'right' });
      doc.y = y + Math.max(nameH, doc.currentLineHeight()) + 2;
      if (item.notes) {
        doc.fontSize(7).fillColor('#555').text(item.notes, MARGIN + 6, doc.y, { width: nameW - 6 });
        doc.fontSize(8).fillColor('#000');
        doc.y += 2;
      }
    }
    this.divider(doc, width);

    this.row(doc, width, 'Subtotal', money(receipt.subtotal));
    if ((receipt.discountAmount ?? 0) > 0) this.row(doc, width, 'Discount', `-${money(receipt.discountAmount ?? 0)}`);
    const charges: Array<[string, number]> = [];
    if (receipt.vatApplied) charges.push([`VAT ${this.pct(receipt.vatRate)}`, receipt.vatAmount ?? 0]);
    if (receipt.entertainmentTaxApplied) {
      charges.push([`Entertainment tax ${this.pct(receipt.entertainmentTaxRate)}`, receipt.entertainmentTaxAmount ?? 0]);
    }
    if (receipt.serviceChargeApplied) {
      charges.push([`Service charge ${this.pct(receipt.serviceChargeRate)}`, receipt.serviceChargeAmount ?? 0]);
    }
    if (charges.length > 0) for (const [label, amount] of charges) this.row(doc, width, label, money(amount));
    else if (receipt.taxAmount > 0) this.row(doc, width, 'Tax', money(receipt.taxAmount));

    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10);
    this.row(doc, width, 'TOTAL', money(receipt.total));
    doc.font('Helvetica').fontSize(8);
    if ((receipt.tipAmount ?? 0) > 0) {
      this.row(doc, width, 'Tip', money(receipt.tipAmount ?? 0));
      doc.font('Helvetica-Bold');
      this.row(doc, width, 'TOTAL CHARGED', money(receipt.total + (receipt.tipAmount ?? 0)));
      doc.font('Helvetica');
    }
    this.divider(doc, width);

    for (const payment of receipt.payments) {
      this.row(doc, width, `Paid: ${this.titleCase(payment.paymentMethod)}`, money(payment.amount));
    }

    doc.moveDown(0.8);
    doc.fontSize(8).text('Thank you!', MARGIN, doc.y, center);
    return doc.y;
  }

  private divider(doc: PDFKit.PDFDocument, width: number) {
    doc.moveDown(0.3);
    doc.strokeColor('#000').lineWidth(0.5).moveTo(MARGIN, doc.y).lineTo(MARGIN + width, doc.y).stroke();
    doc.moveDown(0.4);
  }

  /** A label on the left and a value right-aligned to the page edge, each in its own box. */
  private row(doc: PDFKit.PDFDocument, width: number, label: string, value: string, labelShare = 0.55) {
    const labelW = width * labelShare;
    const valueW = width - labelW;
    const y = doc.y;
    const labelH = doc.heightOfString(label, { width: labelW });
    const valueH = doc.heightOfString(value, { width: valueW, align: 'right' });
    doc.text(label, MARGIN, y, { width: labelW });
    doc.text(value, MARGIN + labelW, y, { width: valueW, align: 'right' });
    doc.y = y + Math.max(labelH, valueH, doc.currentLineHeight()) + 1.5;
  }

  private titleCase(value: string): string {
    return value
      .toLowerCase()
      .split('_')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  private pct(rate?: number): string {
    return `${Number(rate ?? 0)}%`;
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

  private formatNumber(amount: number): string {
    return amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private formatCurrency(amount: number, currency: string): string {
    return `${currency} ${this.formatNumber(amount)}`;
  }
}
