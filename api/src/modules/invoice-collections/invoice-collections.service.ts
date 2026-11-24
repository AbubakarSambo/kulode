import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { UpdateCollectionPolicyDto } from './dto';
import {
  DEFAULT_SCHEDULE,
  ENROLL_LOOKBACK_DAYS,
  firstPendingStepIndex,
  isQuietHour,
  nextSendTime,
  parseSchedule,
  stepDueAt,
} from './invoice-collections.schedule';

const OPEN_INVOICE_STATUSES = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const;
const BATCH_SIZE = 200;

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Automated invoice reminders. A business is enrolled by having a default policy
 * (invoice_collection_policies.client_id NULL); each open invoice then walks the policy schedule.
 *
 * Money state is never decided here: this service only plans and sends reminders. An invoice becomes
 * PAID through the existing payment reconciliation, and this service merely notices that and stops.
 */
@Injectable()
export class InvoiceCollectionsService {
  private readonly logger = new Logger(InvoiceCollectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /** Starts tracking open invoices of enrolled businesses. Returns how many were enrolled. */
  async enrollEligibleInvoices(now = new Date()): Promise<number> {
    const policies = await this.prisma.invoiceCollectionPolicy.findMany({
      where: { clientId: null, paused: false },
      include: { organization: { select: { timezone: true } } },
    });

    let enrolled = 0;
    for (const policy of policies) {
      const timeZone = policy.organization.timezone;
      const schedule = parseSchedule(policy.schedule);
      const lookbackFrom = new Date(now.getTime() - ENROLL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

      const invoices = await this.prisma.invoice.findMany({
        where: {
          organizationId: policy.organizationId,
          deletedAt: null,
          status: { in: [...OPEN_INVOICE_STATUSES] },
          dueDate: { gte: lookbackFrom },
          collection: { is: null },
        },
        select: { id: true, dueDate: true },
        take: 500,
      });

      for (const invoice of invoices) {
        const index = firstPendingStepIndex(schedule, invoice.dueDate, policy.sendHour, timeZone, now);
        const data =
          index === -1
            ? { state: 'OWNER_ATTENTION' as const, stepIndex: schedule.length, nextActionAt: null }
            : {
                state: 'SCHEDULED' as const,
                stepIndex: index,
                nextActionAt: stepDueAt(invoice.dueDate, schedule[index], policy.sendHour, timeZone),
              };
        try {
          await this.prisma.invoiceCollection.create({
            data: { invoiceId: invoice.id, organizationId: policy.organizationId, ...data },
          });
          enrolled++;
        } catch (error) {
          if (!isUniqueViolation(error)) throw error; // another run enrolled it first
        }
      }
    }
    return enrolled;
  }

  /** One scheduler tick: close finished work, then plan (and in AUTO mode send) every due reminder. */
  async processDue(now = new Date()): Promise<number> {
    await this.closeFinishedCollections();
    await this.resumeBrokenPromises(now);

    const due = await this.prisma.invoiceCollection.findMany({
      where: { state: { in: ['SCHEDULED', 'REMINDING'] }, nextActionAt: { lte: now } },
      orderBy: { nextActionAt: 'asc' },
      take: BATCH_SIZE,
      select: { invoiceId: true },
    });

    let processed = 0;
    for (const { invoiceId } of due) {
      try {
        await this.processOne(invoiceId, now);
        processed++;
      } catch (error) {
        this.logger.error(`Collections: failed to process invoice ${invoiceId}: ${(error as Error).message}`);
      }
    }
    return processed;
  }

  /** Invoices that were paid, cancelled or deleted stop being chased, and their queued reminders are dropped. */
  private async closeFinishedCollections(): Promise<void> {
    await this.prisma.invoiceCollection.updateMany({
      where: { state: { notIn: ['PAID', 'CLOSED'] }, invoice: { status: 'PAID' } },
      data: { state: 'PAID', nextActionAt: null },
    });
    await this.prisma.invoiceCollection.updateMany({
      where: {
        state: { notIn: ['PAID', 'CLOSED'] },
        invoice: { OR: [{ status: 'CANCELLED' }, { deletedAt: { not: null } }] },
      },
      data: { state: 'CLOSED', nextActionAt: null },
    });
    await this.prisma.invoiceCollectionReminder.updateMany({
      where: {
        status: 'PENDING_APPROVAL',
        invoice: { OR: [{ status: 'PAID' }, { status: 'CANCELLED' }, { deletedAt: { not: null } }] },
      },
      data: { status: 'SKIPPED' },
    });
  }

  /** A customer's promised date has passed without payment: resume reminders. */
  private async resumeBrokenPromises(now: Date): Promise<void> {
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await this.prisma.invoiceCollection.updateMany({
      where: { state: 'PROMISED', promisedDate: { lt: startOfToday } },
      data: { state: 'REMINDING', nextActionAt: now, promisedDate: null },
    });
  }

  private async processOne(invoiceId: string, now: Date): Promise<void> {
    const collection = await this.prisma.invoiceCollection.findUnique({
      where: { invoiceId },
      include: { invoice: { include: { client: true, organization: { select: { timezone: true } } } } },
    });
    if (
      !collection ||
      (collection.state !== 'SCHEDULED' && collection.state !== 'REMINDING') ||
      !collection.nextActionAt ||
      collection.nextActionAt > now
    ) {
      return;
    }

    const { invoice } = collection;
    const setState = (state: 'PAID' | 'CLOSED' | 'OWNER_ATTENTION') =>
      this.prisma.invoiceCollection.update({
        where: { invoiceId },
        data: { state, nextActionAt: null, lastActionAt: now },
      });

    if (invoice.status === 'PAID') return void (await setState('PAID'));
    if (invoice.status === 'CANCELLED' || invoice.deletedAt) return void (await setState('CLOSED'));

    const policy = await this.effectivePolicy(collection.organizationId, invoice.clientId);
    if (!policy || policy.paused) return; // untouched: resumes when the policy is unpaused

    const { client } = invoice;
    if (!client.phone || !client.whatsappOptIn || client.whatsappOptedOutAt) {
      return void (await setState('OWNER_ATTENTION'));
    }
    if (collection.messagesSent >= policy.maxMessages) return void (await setState('OWNER_ATTENTION'));

    const timeZone = invoice.organization.timezone;
    if (isQuietHour(now, timeZone)) {
      await this.prisma.invoiceCollection.update({
        where: { invoiceId },
        data: { nextActionAt: nextSendTime(now, policy.sendHour, timeZone) },
      });
      return;
    }

    const schedule = parseSchedule(policy.schedule);
    const step = schedule[collection.stepIndex];
    if (!step) return void (await setState('OWNER_ATTENTION'));

    // The unique (invoice_id, step_index) key makes planning idempotent across retries and concurrent runs.
    let reminderId: string | null = null;
    try {
      const reminder = await this.prisma.invoiceCollectionReminder.create({
        data: {
          invoiceId,
          organizationId: collection.organizationId,
          stepIndex: collection.stepIndex,
          template: step.template,
          scheduledFor: collection.nextActionAt,
        },
      });
      reminderId = reminder.id;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }

    // Advance before sending so a crash mid-send can never plan this step again.
    const next = schedule[collection.stepIndex + 1];
    await this.prisma.invoiceCollection.update({
      where: { invoiceId },
      data: {
        stepIndex: collection.stepIndex + 1,
        state: next ? 'REMINDING' : 'OWNER_ATTENTION',
        nextActionAt: next ? stepDueAt(invoice.dueDate, next, policy.sendHour, timeZone) : null,
        lastActionAt: now,
      },
    });

    if (reminderId && policy.mode === 'AUTO') await this.sendReminder(reminderId);
  }

  /** A client-specific policy overrides the business default. */
  private async effectivePolicy(organizationId: string, clientId: string) {
    const override = await this.prisma.invoiceCollectionPolicy.findFirst({ where: { organizationId, clientId } });
    if (override) return override;
    return this.prisma.invoiceCollectionPolicy.findFirst({ where: { organizationId, clientId: null } });
  }

  /**
   * Sends one planned reminder. The status claim makes it safe to call twice (a double tap on Approve,
   * or the scheduler racing an owner): only one caller moves PENDING_APPROVAL to SENDING.
   */
  async sendReminder(reminderId: string): Promise<{ sent: boolean; reason?: string }> {
    const claimed = await this.prisma.invoiceCollectionReminder.updateMany({
      where: { id: reminderId, status: 'PENDING_APPROVAL' },
      data: { status: 'SENDING' },
    });
    if (claimed.count === 0) return { sent: false, reason: 'not_pending' };

    const reminder = await this.prisma.invoiceCollectionReminder.findUnique({
      where: { id: reminderId },
      include: { invoice: { include: { client: true } } },
    });
    if (!reminder) return { sent: false, reason: 'not_found' };

    const { invoice } = reminder;
    const { client } = invoice;
    const skip = async (reason: string) => {
      await this.prisma.invoiceCollectionReminder.update({
        where: { id: reminderId },
        data: { status: 'SKIPPED', errorMessage: reason },
      });
      return { sent: false, reason };
    };

    // Re-check at send time: approval can come days after the reminder was planned.
    if (!(OPEN_INVOICE_STATUSES as readonly string[]).includes(invoice.status) || invoice.deletedAt) {
      return skip('invoice_closed');
    }
    if (!client.phone || !client.whatsappOptIn || client.whatsappOptedOutAt) return skip('no_consent');

    try {
      const outstanding = Math.max(Number(invoice.total) - Number(invoice.amountPaid), 0);
      const { providerMessageId } = await this.whatsapp.sendInvoiceReminderTemplate({
        organizationId: reminder.organizationId,
        invoiceId: invoice.id,
        clientId: client.id,
        toPhone: client.phone,
        clientName: client.name,
        invoiceNumber: invoice.invoiceNumber,
        amountDue: outstanding.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' }),
        dueDate: invoice.dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        shareToken: invoice.shareToken,
      });
      await this.prisma.invoiceCollectionReminder.update({
        where: { id: reminderId },
        data: { status: 'SENT', sentAt: new Date(), providerMessageId },
      });
      await this.prisma.invoiceCollection.updateMany({
        where: { invoiceId: invoice.id },
        data: { messagesSent: { increment: 1 } },
      });
      return { sent: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.prisma.invoiceCollectionReminder.update({
        where: { id: reminderId },
        data: { status: 'FAILED', errorMessage: message },
      });
      this.logger.warn(`Collections: reminder ${reminderId} failed to send: ${message}`);
      return { sent: false, reason: 'send_failed' };
    }
  }

  // ---- Owner actions ----

  /** The business default policy. Before it is switched on, returns the defaults with `enabled: false`. */
  async getPolicy(organizationId: string) {
    const policy = await this.prisma.invoiceCollectionPolicy.findFirst({ where: { organizationId, clientId: null } });
    if (policy) return { enabled: true, ...this.policyView(policy) };
    return {
      enabled: false,
      schedule: DEFAULT_SCHEDULE,
      mode: 'APPROVE' as const,
      sendHour: 9,
      maxMessages: 4,
      paused: false,
    };
  }

  /**
   * Creates the business default policy (which enrols the business) or changes the fields sent.
   * New businesses start in APPROVE mode. Changing the schedule applies to steps not yet planned;
   * reminders already queued are unaffected.
   */
  async upsertPolicy(organizationId: string, dto: UpdateCollectionPolicyDto) {
    const data = {
      ...(dto.schedule && { schedule: dto.schedule.map(({ offsetDays, template }) => ({ offsetDays, template })) }),
      ...(dto.mode && { mode: dto.mode }),
      ...(dto.sendHour !== undefined && { sendHour: dto.sendHour }),
      ...(dto.maxMessages !== undefined && { maxMessages: dto.maxMessages }),
      ...(dto.paused !== undefined && { paused: dto.paused }),
    };
    const existing = await this.prisma.invoiceCollectionPolicy.findFirst({ where: { organizationId, clientId: null } });
    const saved = existing
      ? await this.prisma.invoiceCollectionPolicy.update({ where: { id: existing.id }, data })
      : await this.prisma.invoiceCollectionPolicy.create({
          data: { organizationId, clientId: null, schedule: DEFAULT_SCHEDULE, ...data },
        });
    return { enabled: true, ...this.policyView(saved) };
  }

  private policyView(policy: { schedule: unknown; mode: string; sendHour: number; maxMessages: number; paused: boolean }) {
    return {
      schedule: parseSchedule(policy.schedule),
      mode: policy.mode,
      sendHour: policy.sendHour,
      maxMessages: policy.maxMessages,
      paused: policy.paused,
    };
  }


  listPendingReminders(organizationId: string) {
    return this.prisma.invoiceCollectionReminder.findMany({
      where: { organizationId, status: 'PENDING_APPROVAL' },
      orderBy: { scheduledFor: 'asc' },
      include: { invoice: { select: { invoiceNumber: true, total: true, amountPaid: true, dueDate: true, client: { select: { name: true } } } } },
    });
  }

  async approveReminder(organizationId: string, reminderId: string) {
    const reminder = await this.prisma.invoiceCollectionReminder.findFirst({
      where: { id: reminderId, organizationId },
      select: { id: true },
    });
    if (!reminder) throw new NotFoundException('Reminder not found');
    return this.sendReminder(reminder.id);
  }

  async skipReminder(organizationId: string, reminderId: string) {
    const result = await this.prisma.invoiceCollectionReminder.updateMany({
      where: { id: reminderId, organizationId, status: 'PENDING_APPROVAL' },
      data: { status: 'SKIPPED', errorMessage: 'skipped_by_owner' },
    });
    if (result.count === 0) throw new NotFoundException('No pending reminder with that id');
    return { skipped: true };
  }
}
