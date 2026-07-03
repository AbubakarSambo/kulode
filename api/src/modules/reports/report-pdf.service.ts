import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ReportsService } from './reports.service';
import { ReportFilterDto } from './dto';
import * as PDFDocument from 'pdfkit';

@Injectable()
export class ReportPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly reportsService: ReportsService,
  ) {}

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(value);
  }

  async generatePdf(organizationId: string, filter: ReportFilterDto): Promise<Buffer> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new Error('Organization not found');

    const summary = await this.reportsService.getSummary(organizationId, filter);
    const servicesData = await this.reportsService.getTopServices(organizationId, filter);
    const productsData = await this.reportsService.getTopProducts(organizationId, filter);
    const incomeBreakdown = await this.reportsService.getIncomeBreakdown(organizationId, filter);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Financial Report`,
          Author: org.name,
        },
        bufferPages: true,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Tari1 Brand Colors
      const primaryColor = '#0037b0';
      const textColor = '#121c28';
      const mutedColor = '#434655';
      const successColor = '#006c49';

      let yPos = 50;

      // --- Header Section ---
      doc.fillColor(textColor).fontSize(20).font('Helvetica-Bold').text(org.name, 50, yPos);
      doc.fontSize(12).font('Helvetica').fillColor(mutedColor).text('Financial Performance Report', 50, yPos + 25);
      
      doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold').text(`Period: ${(filter.period || 'CUSTOM').replace('_', ' ')}`, 400, yPos, { align: 'right' });
      const generatedAt = new Date().toLocaleDateString('en-NG');
      doc.fillColor(mutedColor).font('Helvetica').text(`Generated: ${generatedAt}`, 400, yPos + 15, { align: 'right' });

      yPos += 60;
      doc.strokeColor('#e2e8f0').lineWidth(0.75).moveTo(50, yPos).lineTo(545, yPos).stroke();
      yPos += 30;

      // --- Financial Health Overview ---
      doc.fontSize(14).font('Helvetica-Bold').fillColor(primaryColor).text('Financial Health Overview', 50, yPos);
      yPos += 25;

      doc.fontSize(10).fillColor(textColor);
      
      // Draw a 3-column metrics grid
      doc.font('Helvetica-Bold').fillColor(mutedColor).text('TOTAL REVENUE', 50, yPos);
      doc.font('Helvetica-Bold').fillColor(mutedColor).text('TOTAL EXPENSES', 250, yPos);
      doc.font('Helvetica-Bold').fillColor(mutedColor).text('NET PROFIT', 450, yPos);
      
      yPos += 15;
      doc.fontSize(14).font('Helvetica-Bold').fillColor(successColor).text(this.formatCurrency(summary.income.total), 50, yPos);
      doc.fillColor('#ba1a1a').text(this.formatCurrency(summary.expenses.total), 250, yPos);
      doc.fillColor(summary.profit >= 0 ? successColor : '#ba1a1a').text(this.formatCurrency(summary.profit), 450, yPos);

      yPos += 40;
      doc.strokeColor('#e2e8f0').lineWidth(0.75).moveTo(50, yPos).lineTo(545, yPos).stroke();
      yPos += 30;

      // --- Top Performing Products & Services ---
      doc.fontSize(14).font('Helvetica-Bold').fillColor(primaryColor).text('Top 15 Items (By Revenue)', 50, yPos);
      yPos += 25;

      // Table Header
      doc.fontSize(9).font('Helvetica-Bold').fillColor(mutedColor);
      doc.text('ITEM NAME', 50, yPos);
      doc.text('VOLUME (QTY)', 300, yPos);
      doc.text('TXNS', 380, yPos);
      doc.text('REVENUE', 450, yPos);
      
      doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(50, yPos + 12).lineTo(545, yPos + 12).stroke();
      yPos += 20;

      const topItems = [...(servicesData.services || []), ...(productsData.products || [])]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 15);

      doc.fontSize(10).font('Helvetica').fillColor(textColor);
      
      if (topItems.length === 0) {
        doc.fillColor(mutedColor).text('No sales data recorded for this period.', 50, yPos);
        yPos += 20;
      }

      for (const item of topItems) {
        if (yPos > 720) {
          doc.addPage();
          yPos = 50;
        }
        doc.text(item.label.substring(0, 45), 50, yPos);
        doc.text(item.volume.toString(), 300, yPos);
        doc.text(item.count.toString(), 380, yPos);
        doc.text(this.formatCurrency(item.revenue), 450, yPos);
        
        doc.strokeColor('#f1f5f9').lineWidth(0.5).moveTo(50, yPos + 12).lineTo(545, yPos + 12).stroke();
        yPos += 20;
      }

      // --- Client Concentration ---
      if (incomeBreakdown?.topClients?.length > 0) {
        yPos += 20;
        if (yPos > 650) {
          doc.addPage();
          yPos = 50;
        }

        doc.fontSize(14).font('Helvetica-Bold').fillColor(primaryColor).text('Client Concentration Risk (Top 10)', 50, yPos);
        yPos += 25;

        // Table Header
        doc.fontSize(9).font('Helvetica-Bold').fillColor(mutedColor);
        doc.text('CLIENT NAME', 50, yPos);
        doc.text('PAYMENTS', 380, yPos);
        doc.text('TOTAL REVENUE', 450, yPos);
        
        doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(50, yPos + 12).lineTo(545, yPos + 12).stroke();
        yPos += 20;

        doc.fontSize(10).font('Helvetica').fillColor(textColor);
        const topClients = incomeBreakdown.topClients.slice(0, 10);
        
        for (const client of topClients) {
          if (yPos > 720) {
            doc.addPage();
            yPos = 50;
          }
          doc.text(client.clientName.substring(0, 55), 50, yPos);
          doc.text(client.paymentCount.toString(), 380, yPos);
          doc.text(this.formatCurrency(client.total), 450, yPos);
          
          doc.strokeColor('#f1f5f9').lineWidth(0.5).moveTo(50, yPos + 12).lineTo(545, yPos + 12).stroke();
          yPos += 20;
        }
      }

      // --- Pagination Footer ---
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor(mutedColor)
           .text(`Page ${i + 1} of ${pages.count}`, 50, 800, { align: 'center' });
        doc.text('Built with Tari1 · www.tarione.com', 50, 800, { align: 'right' });
      }

      doc.end();
    });
  }
}
