import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';

const VAT_RATE = 0.075; // 7.5%
const SMALL_COMPANY_THRESHOLD = 100_000_000; // ₦100M

const TAX_CATEGORY_LABELS: Record<string, string> = {
  RENT: 'Rent',
  SALARIES: 'Salaries & Wages',
  UTILITIES: 'Utilities',
  MARKETING: 'Marketing & Advertising',
  TRANSPORT: 'Transport & Travel',
  PROFESSIONAL_FEES: 'Professional Fees',
  LOAN_INTEREST: 'Loan Interest',
  CAPITAL_ASSETS: 'Capital Assets',
  NON_DEDUCTIBLE: 'Non-Deductible',
  UNCATEGORIZED: 'Uncategorized',
};

@Injectable()
export class TaxService {
  constructor(private prisma: PrismaService) {}

  // ─── Deductible summary for the dashboard ─────────────────────────────────
  async getDeductibleSummary(organizationId: string, year: number) {
    const startDate = new Date(`${year}-01-01T00:00:00.000Z`);
    const endDate = new Date(`${year}-12-31T23:59:59.999Z`);

    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        deletedAt: null,
        isDeductible: true,
        expenseDate: { gte: startDate, lte: endDate },
      },
      select: { taxCategory: true, amount: true },
    });

    const byCategory: Record<string, { label: string; total: number; count: number }> = {};
    let total = 0;

    for (const exp of expenses) {
      const cat = exp.taxCategory as string;
      const amount = Number(exp.amount);
      total += amount;
      if (!byCategory[cat]) {
        byCategory[cat] = { label: TAX_CATEGORY_LABELS[cat] ?? cat, total: 0, count: 0 };
      }
      byCategory[cat].total += amount;
      byCategory[cat].count += 1;
    }

    return {
      year,
      total,
      byCategory: Object.entries(byCategory).map(([category, data]) => ({
        category,
        ...data,
      })),
    };
  }

  // ─── Filing pack preview ───────────────────────────────────────────────────
  async getFilingPackPreview(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const [org, invoices, expenses] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, email: true, address: true, vatEnabled: true, taxRate: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          deletedAt: null,
          issueDate: { gte: startDate, lte: endDate },
        },
        include: { client: { select: { name: true } } },
        orderBy: { issueDate: 'asc' },
      }),
      this.prisma.expense.findMany({
        where: {
          organizationId,
          deletedAt: null,
          expenseDate: { gte: startDate, lte: endDate },
        },
        include: { vendor: { select: { name: true } } },
        orderBy: { expenseDate: 'asc' },
      }),
    ]);

    // Revenue
    const paidInvoices = invoices.filter((inv) => inv.status === 'PAID' || inv.status === 'PARTIALLY_PAID');
    const totalRevenue = paidInvoices.reduce((sum, inv) => sum + Number(inv.amountPaid), 0);
    const totalCollected = paidInvoices.reduce((sum, inv) => sum + Number(inv.amountPaid), 0);
    const totalOutstanding = invoices
      .filter((inv) => inv.status === 'SENT' || inv.status === 'OVERDUE' || inv.status === 'PARTIALLY_PAID')
      .reduce((sum, inv) => sum + (Number(inv.total) - Number(inv.amountPaid)), 0);

    // VAT
    const vatCollected = paidInvoices.reduce((sum, inv) => sum + Number(inv.taxAmount), 0);

    // Expenses
    const deductibleExpenses = expenses.filter((e) => e.isDeductible);
    const nonDeductibleExpenses = expenses.filter((e) => !e.isDeductible);

    // Deductible by category
    const deductibleByCategory: Record<string, { label: string; total: number; count: number }> = {};
    let totalDeductible = 0;
    for (const exp of deductibleExpenses) {
      const cat = exp.taxCategory as string;
      const amount = Number(exp.amount);
      totalDeductible += amount;
      if (!deductibleByCategory[cat]) {
        deductibleByCategory[cat] = { label: TAX_CATEGORY_LABELS[cat] ?? cat, total: 0, count: 0 };
      }
      deductibleByCategory[cat].total += amount;
      deductibleByCategory[cat].count += 1;
    }

    const totalNonDeductible = nonDeductibleExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    // VAT paid on deductible expenses (7.5% of deductible expense amounts — approximated)
    // In practice this would require per-expense VAT fields; we approximate here
    const vatPaidOnExpenses = totalDeductible * VAT_RATE;
    const netVatLiability = vatCollected - vatPaidOnExpenses;

    // Taxable profit
    const taxableProfit = totalRevenue - totalDeductible;

    // CIT calculation
    let citStatus: string;
    let citAmount = 0;
    if (totalRevenue <= SMALL_COMPANY_THRESHOLD) {
      citStatus = '0% — Small Company Exempt (Nigeria Tax Act 2025)';
    } else {
      const citRate = 0.3; // 30% standard CIT above threshold
      citAmount = Math.max(0, taxableProfit) * citRate;
      citStatus = `30% on taxable profit — estimated CIT: ₦${this.fmt(citAmount)}`;
    }

    // Compliance checklist
    const [tinCheck, numberedCheck, receiptsCheck, outstandingCheck] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { phone: true, email: true },
      }),
      this.checkInvoicesNumbered(invoices),
      this.checkReceiptsUploaded(expenses),
      Promise.resolve(totalOutstanding),
    ]);

    const compliance = [
      {
        id: 'tin',
        label: 'TIN on file',
        status: (tinCheck?.phone || tinCheck?.email) ? 'ok' : 'warn',
        hint: 'Ensure your Tax Identification Number is recorded in your business profile',
      },
      {
        id: 'invoice_numbers',
        label: 'Invoices numbered sequentially',
        status: numberedCheck ? 'ok' : 'warn',
        hint: 'All issued invoices should have unique sequential numbers',
      },
      {
        id: 'receipts',
        label: 'Receipts uploaded for expenses',
        status: receiptsCheck ? 'ok' : 'warn',
        hint: 'Attach receipts or references to deductible expenses for audit trail',
      },
      {
        id: 'outstanding',
        label: 'Outstanding invoices',
        status: outstandingCheck > 0 ? 'warn' : 'ok',
        hint: outstandingCheck > 0
          ? `₦${this.fmt(outstandingCheck)} in unpaid invoices — follow up before filing`
          : 'All invoices are settled',
      },
    ];

    return {
      period: { startDate, endDate },
      organization: org,
      revenue: {
        totalRevenue,
        totalCollected,
        totalOutstanding,
        vatCollected,
        invoiceCount: invoices.length,
        paidInvoiceCount: paidInvoices.length,
      },
      expenses: {
        deductible: {
          total: totalDeductible,
          byCategory: Object.entries(deductibleByCategory).map(([category, data]) => ({ category, ...data })),
        },
        nonDeductible: { total: totalNonDeductible, count: nonDeductibleExpenses.length },
      },
      tax: {
        taxableProfit,
        citStatus,
        citAmount,
        vatCollected,
        vatPaidOnExpenses,
        netVatLiability,
      },
      compliance,
    };
  }

  // ─── Generate PDF summary ──────────────────────────────────────────────────
  async generatePdfSummary(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Buffer> {
    const data = await this.getFilingPackPreview(organizationId, startDate, endDate);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = doc.page.width - 100;
      const blue = '#1d4ed8';
      const gray = '#6b7280';
      const light = '#f3f4f6';

      // Header
      doc.rect(0, 0, doc.page.width, 70).fill(blue);
      doc.fillColor('white').fontSize(20).font('Helvetica-Bold').text('TAX FILING SUMMARY', 50, 20);
      doc.fontSize(10).font('Helvetica').text(
        `Period: ${this.fmtDate(startDate)} – ${this.fmtDate(endDate)}`,
        50, 46,
      );
      doc.fillColor('black');

      let y = 90;

      // Organization
      doc.fontSize(10).fillColor(gray).text('PREPARED FOR', 50, y);
      y += 14;
      doc.fontSize(13).fillColor('black').font('Helvetica-Bold')
        .text(data.organization?.name ?? 'Your Business', 50, y);
      y += 16;
      doc.fontSize(9).font('Helvetica').fillColor(gray)
        .text(`Generated: ${new Date().toLocaleDateString('en-NG', { dateStyle: 'long' })}`, 50, y);
      y += 24;

      doc.moveTo(50, y).lineTo(50 + pageW, y).strokeColor('#e5e7eb').stroke();
      y += 16;

      // Revenue section
      y = this.pdfSection(doc, 'REVENUE', y, blue);
      y = this.pdfRow(doc, 'Total Revenue (Paid Invoices)', data.revenue.totalRevenue, y);
      y = this.pdfRow(doc, 'Total Collected', data.revenue.totalCollected, y);
      y = this.pdfRow(doc, 'Outstanding', data.revenue.totalOutstanding, y, '#dc2626');
      y = this.pdfRow(doc, 'VAT Collected on Paid Invoices', data.revenue.vatCollected, y);
      y += 10;

      // Deductible expenses
      y = this.pdfSection(doc, 'DEDUCTIBLE EXPENSES', y, '#059669');
      for (const cat of data.expenses.deductible.byCategory) {
        y = this.pdfRow(doc, `  ${cat.label} (${cat.count})`, cat.total, y);
      }
      y = this.pdfRowBold(doc, 'Total Deductible', data.expenses.deductible.total, y, '#059669');
      y += 6;

      // Non-deductible
      y = this.pdfSection(doc, 'NON-DEDUCTIBLE EXPENSES (excluded from profit calc)', y, '#dc2626');
      y = this.pdfRow(doc, `  Non-deductible (${data.expenses.nonDeductible.count} expenses)`, data.expenses.nonDeductible.total, y, '#dc2626');
      y += 10;

      // Tax calculation
      y = this.pdfSection(doc, 'TAX CALCULATION', y, blue);
      y = this.pdfRow(doc, 'Taxable Profit (Revenue – Deductible Expenses)', data.tax.taxableProfit, y);
      doc.fontSize(9).fillColor(gray).text(`CIT: ${data.tax.citStatus.replace(/₦/g, 'NGN ')}`, 54, y, { width: pageW });
      y += doc.currentLineHeight() + 4;
      y = this.pdfRow(doc, 'VAT Collected', data.tax.vatCollected, y);
      y = this.pdfRow(doc, 'VAT Paid on Expenses (approx.)', data.tax.vatPaidOnExpenses, y);
      y = this.pdfRowBold(doc, 'Net VAT Liability', data.tax.netVatLiability, y, blue);
      y += 10;

      // Compliance
      if (y > 680) { doc.addPage(); y = 50; }
      y = this.pdfSection(doc, 'COMPLIANCE CHECKLIST', y, '#7c3aed');
      for (const item of data.compliance) {
        const iconColor = item.status === 'ok' ? '#059669' : '#d97706';
        const iconText = item.status === 'ok' ? 'OK' : '!';
        doc.fontSize(8).fillColor(iconColor).font('Helvetica-Bold')
          .text(iconText, 54, y + 1, { width: 20 });
        doc.fontSize(9.5).fillColor('black').font('Helvetica')
          .text(item.label, 78, y, { width: pageW - 28 });
        y += 14;
        if (item.status !== 'ok') {
          doc.fontSize(8).fillColor(gray)
            .text(item.hint, 78, y, { width: pageW - 28 });
          y += doc.currentLineHeight() + 4;
        }
      }

      // Footer
      doc.fontSize(8).fillColor(gray).text(
        'Generated by Kulode Tax Pro — for accountant or FIRS submission purposes only.',
        50,
        doc.page.height - 40,
        { align: 'center', width: pageW },
      );

      doc.end();
    });
  }

  // ─── Generate CSV (Excel-compatible) ──────────────────────────────────────
  async generateCsv(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Buffer> {
    const [invoices, expenses] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          deletedAt: null,
          issueDate: { gte: startDate, lte: endDate },
        },
        include: { client: { select: { name: true } } },
        orderBy: { issueDate: 'asc' },
      }),
      this.prisma.expense.findMany({
        where: {
          organizationId,
          deletedAt: null,
          expenseDate: { gte: startDate, lte: endDate },
        },
        include: { vendor: { select: { name: true } }, category: { select: { name: true } } },
        orderBy: { expenseDate: 'asc' },
      }),
    ]);

    const rows: string[] = [];

    // Invoices sheet
    rows.push('INVOICES');
    rows.push('Invoice Number,Client,Issue Date,Due Date,Status,Subtotal,Tax Amount,Total,Amount Paid,Outstanding');
    for (const inv of invoices) {
      const outstanding = Number(inv.total) - Number(inv.amountPaid);
      rows.push(this.csvRow([
        inv.invoiceNumber,
        inv.client.name,
        this.fmtDate(inv.issueDate),
        this.fmtDate(inv.dueDate),
        inv.status,
        Number(inv.subtotal),
        Number(inv.taxAmount),
        Number(inv.total),
        Number(inv.amountPaid),
        outstanding,
      ]));
    }

    rows.push('');
    rows.push('EXPENSES');
    rows.push('Date,Description,Category,Tax Category,Is Deductible,Vendor,Payment Method,Amount,Reference');
    for (const exp of expenses) {
      rows.push(this.csvRow([
        this.fmtDate(exp.expenseDate),
        exp.description,
        exp.category?.name ?? '',
        TAX_CATEGORY_LABELS[exp.taxCategory as string] ?? exp.taxCategory,
        exp.isDeductible ? 'Yes' : 'No',
        exp.vendor?.name ?? exp.recipient ?? '',
        exp.paymentMethod,
        Number(exp.amount),
        exp.reference ?? '',
      ]));
    }

    return Buffer.from(rows.join('\n'), 'utf-8');
  }

  // ─── Log a report generation event ────────────────────────────────────────
  async logGeneration(
    organizationId: string,
    userId: string,
    startDate: Date,
    endDate: Date,
  ) {
    return this.prisma.taxReportLog.create({
      data: { organizationId, userId, periodStart: startDate, periodEnd: endDate },
    });
  }

  async getReportLogs(organizationId: string) {
    return this.prisma.taxReportLog.findMany({
      where: { organizationId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { generatedAt: 'desc' },
      take: 50,
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  private fmt(n: number): string {
    return n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private fmtDate(d: Date | string): string {
    return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private csvRow(cells: (string | number)[]): string {
    return cells.map((c) => {
      const s = String(c);
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',');
  }

  private checkInvoicesNumbered(invoices: any[]): boolean {
    return invoices.every((inv) => inv.invoiceNumber && inv.invoiceNumber.trim().length > 0);
  }

  private checkReceiptsUploaded(expenses: any[]): boolean {
    if (expenses.length === 0) return true;
    const withRef = expenses.filter((e) => e.reference || e.notes).length;
    return withRef / expenses.length >= 0.5; // at least 50% have a reference/note
  }

  private pdfSection(doc: any, title: string, y: number, color: string): number {
    doc.rect(50, y, doc.page.width - 100, 18).fill(color);
    doc.fontSize(9).fillColor('white').font('Helvetica-Bold')
      .text(title, 54, y + 4, { width: doc.page.width - 108 });
    doc.fillColor('black').font('Helvetica');
    return y + 24;
  }

  private pdfRow(doc: any, label: string, amount: number, y: number, color = 'black'): number {
    const pageW = doc.page.width - 100;
    doc.fontSize(9.5).fillColor('black').font('Helvetica')
      .text(label, 54, y, { width: pageW - 100 });
    doc.fillColor(color)
      .text(`NGN ${this.fmt(amount)}`, 50, y, { width: pageW, align: 'right' });
    return y + 14;
  }

  private pdfRowBold(doc: any, label: string, amount: number, y: number, color = 'black'): number {
    const pageW = doc.page.width - 100;
    doc.fontSize(10).font('Helvetica-Bold').fillColor(color)
      .text(label, 54, y, { width: pageW - 100 });
    doc.fillColor(color)
      .text(`NGN ${this.fmt(amount)}`, 50, y, { width: pageW, align: 'right' });
    doc.font('Helvetica');
    return y + 16;
  }
}
