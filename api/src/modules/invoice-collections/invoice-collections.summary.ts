import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_STATUSES = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const;
const naira = (n: number) => n.toLocaleString('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

export interface WeeklySummary {
  /** Payments received in the window on invoices that had already been reminded before the payment. */
  collectedAfterReminders: number;
  remindersSent: number;
  overdueTotal: number;
  needsAttention: number;
}

/**
 * The owner's weekly "what did the reminders do" message. "Collected after reminders" counts money that
 * arrived after a reminder went out for that invoice. It says nothing about whether the reminder caused
 * the payment, and the wording sent to the owner does not claim it did.
 */
@Injectable()
export class InvoiceCollectionsSummaryService {
  private readonly logger = new Logger(InvoiceCollectionsSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async buildSummary(organizationId: string, now = new Date()): Promise<WeeklySummary> {
    const since = new Date(now.getTime() - 7 * DAY_MS);

    const [sent, payments, overdue, needsAttention] = await Promise.all([
      this.prisma.invoiceCollectionReminder.count({ where: { organizationId, status: 'SENT', sentAt: { gte: since, lte: now } } }),
      this.prisma.payment.findMany({
        where: { organizationId, paymentDate: { gte: since, lte: now }, invoice: { collection: { isNot: null } } },
        select: { amount: true, paymentDate: true, invoiceId: true },
      }),
      this.prisma.invoice.findMany({
        where: { organizationId, deletedAt: null, status: { in: [...OPEN_STATUSES] }, dueDate: { lt: now } },
        select: { total: true, amountPaid: true },
        take: 5000,
      }),
      this.prisma.invoiceCollection.count({ where: { organizationId, state: 'OWNER_ATTENTION' } }),
    ]);

    const firstReminded = payments.length
      ? await this.prisma.invoiceCollectionReminder.groupBy({
          by: ['invoiceId'],
          where: { status: 'SENT', invoiceId: { in: [...new Set(payments.map((p) => p.invoiceId).filter((id): id is string => !!id))] } },
          _min: { sentAt: true },
        })
      : [];
    const firstSentAt = new Map(firstReminded.map((r) => [r.invoiceId, r._min?.sentAt]));

    const collectedAfterReminders = payments
      .filter((p) => {
        const first = p.invoiceId ? firstSentAt.get(p.invoiceId) : null;
        return !!first && p.paymentDate > first;
      })
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const overdueTotal = overdue.reduce((sum, i) => sum + Math.max(Number(i.total) - Number(i.amountPaid), 0), 0);

    return { collectedAfterReminders, remindersSent: sent, overdueTotal, needsAttention };
  }

  /**
   * Sends the weekly message to each enrolled business's owner WhatsApp number(s). A business that got
   * one in the last 6 days is skipped, so a repeated or overlapping run never double-sends. Returns how
   * many businesses were messaged.
   */
  async sendWeeklySummaries(now = new Date()): Promise<number> {
    const policies = await this.prisma.invoiceCollectionPolicy.findMany({
      where: { clientId: null, paused: false },
      select: { organizationId: true, organization: { select: { name: true, ownerWhatsappPhone: true } } },
    });

    let messaged = 0;
    for (const { organizationId, organization } of policies) {
      const phones = (organization.ownerWhatsappPhone ?? '').split(',').map((p) => p.trim()).filter(Boolean);
      if (phones.length === 0) continue;
      try {
        const recent = await this.prisma.whatsappMessage.findFirst({
          where: { organizationId, templateName: this.whatsapp.weeklySummaryTemplateName, status: { not: 'FAILED' }, createdAt: { gte: new Date(now.getTime() - 6 * DAY_MS) } },
          select: { id: true },
        });
        if (recent) continue;

        const summary = await this.buildSummary(organizationId, now);
        // A quiet week with nothing outstanding is not worth a message.
        if (summary.remindersSent === 0 && summary.collectedAfterReminders === 0 && summary.needsAttention === 0) continue;

        // Each number is tried on its own, so one bad number never stops the others.
        let delivered = 0;
        for (const toPhone of phones) {
          try {
            await this.whatsapp.sendCustomerTemplate({
              organizationId,
              toPhone,
              templateName: this.whatsapp.weeklySummaryTemplateName,
              bodyValues: [naira(summary.collectedAfterReminders), String(summary.remindersSent), naira(summary.overdueTotal), String(summary.needsAttention)],
            });
            delivered++;
          } catch (error) {
            this.logger.error(`Collections: weekly summary to ${toPhone} failed for organization ${organizationId}: ${(error as Error).message}`);
          }
        }
        if (delivered === 0) continue;
        messaged++;
      } catch (error) {
        this.logger.error(`Collections: weekly summary failed for organization ${organizationId}: ${(error as Error).message}`);
      }
    }
    return messaged;
  }
}
