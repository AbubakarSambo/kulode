import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { PosDashboardService } from '../orders/pos-dashboard.service';
import { ReportPeriod } from '../reports/dto/report-filter.dto';

@Injectable()
export class SalesSummaryCron {
  private readonly logger = new Logger(SalesSummaryCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
    private readonly posDashboardService: PosDashboardService,
  ) {}

  // Fires just before EVERY_DAY_AT_MIDNIGHT's cutoff so "today" still means the day that's
  // ending, not the one that just started - a 23:55 order still lands in the summary it belongs to.
  @Cron('55 23 * * *')
  async sendDailySummaries() {
    this.logger.log('Running daily sales summary WhatsApp send...');

    const orgs = await this.prisma.organization.findMany({
      where: {
        ownerWhatsappPhone: { not: null },
        enabledModules: { in: ['POS', 'BOTH'] },
      },
      select: { id: true, ownerWhatsappPhone: true },
    });

    this.logger.log(`Found ${orgs.length} org(s) eligible for a daily sales summary`);

    for (const org of orgs) {
      if (!org.ownerWhatsappPhone) continue;

      try {
        const summary = await this.posDashboardService.getSummary(org.id, { period: ReportPeriod.TODAY });

        const summaryDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        const currency = (value: number) => value.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });

        await this.whatsappService.sendDailySalesSummaryTemplate({
          organizationId: org.id,
          toPhone: org.ownerWhatsappPhone,
          summaryDate,
          totalSales: currency(summary.sales.total),
          amountPaid: currency(summary.orderBreakdown.closedPaid.amount),
          outstandingCredit: currency(summary.orderBreakdown.closedUnpaid.outstanding),
        });

        this.logger.log(`Daily sales summary sent (org: ${org.id})`);
      } catch (err) {
        this.logger.error(`Failed to send daily sales summary for org ${org.id}: ${err.message}`);
      }
    }

    this.logger.log('Daily sales summary send complete.');
  }
}
