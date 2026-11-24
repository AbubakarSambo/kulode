import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { phoneDigitVariants } from '../../common/phone';
import { InboundMessage, WhatsappService } from '../whatsapp/whatsapp.service';
import { classifyReply } from './invoice-collections.inbound';
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

/** Thrown inside the inbound transaction to roll it back when Meta retried a message we already handled. */
class DuplicateInboundMessage extends Error {}

/**
 * Automated invoice reminders. A business is enrolled by having a default policy
 * (invoice_collection_policies.client_id NULL); each open invoice then walks the policy schedule.
 *
 * Money state is never decided here: this service only plans and sends reminders. An invoice becomes
 * PAID through the existing payment reconciliation, and this service merely notices that and stops.
 */
@Injectable()
export class InvoiceCollectionsService implements OnModuleInit {
  private readonly logger = new Logger(InvoiceCollectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  onModuleInit(): void {
    this.whatsapp.onInboundMessage((message) => this.handleInboundMessage(message));
  }

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
          // Only customers we can actually message. Others are picked up on a later run once a phone
          // number and WhatsApp consent exist (the invoice is still inside the lookback window).
          client: { phone: { not: null }, whatsappOptIn: true, whatsappOptedOutAt: null },
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
    if (client.whatsappOptedOutAt) return void (await setState('OWNER_ATTENTION')); // the customer said STOP
    if (!client.phone || !client.whatsappOptIn) {
      // Consent or a number may be added later: try again tomorrow instead of dropping the invoice.
      await this.prisma.invoiceCollection.update({
        where: { invoiceId },
        data: { nextActionAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
      });
      return;
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
        // `payment_reminder` stays on the configured default (WHATSAPP_REMINDER_TEMPLATE_NAME); the other steps use their own template.
        templateName: reminder.template === 'payment_reminder' ? undefined : reminder.template,
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

  /**
   * A customer replied on WhatsApp. Ties the reply to an invoice (the message they replied to, else the
   * last reminder we sent that number), classifies it, and acts. Safe to call twice for the same message.
   *
   * Nothing here decides money state: "I have paid" asks the owner to check, it never marks the invoice paid.
   */
  async handleInboundMessage(message: InboundMessage, now = new Date()): Promise<void> {
    const outbound = message.contextId
      ? await this.prisma.whatsappMessage.findUnique({ where: { providerMessageId: message.contextId } })
      : await this.prisma.whatsappMessage.findFirst({
          where: { toPhone: message.from, invoiceId: { not: null } },
          orderBy: { createdAt: 'desc' },
        });
    const organizationId = outbound?.organizationId ?? null;
    const invoiceId = outbound?.invoiceId ?? null;
    const clientId = outbound?.clientId ?? null;

    const org = organizationId
      ? await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } })
      : null;
    const reply = classifyReply(message.text, now, org?.timezone ?? 'Africa/Lagos');

    // The dedupe row and every state change commit together. If any step fails the row rolls back too,
    // so Meta's retry is handled afresh instead of being skipped as "already seen".
    try {
      await this.prisma.$transaction(async (tx) => {
        try {
          await tx.inboundWhatsappMessage.create({
            data: {
              providerMessageId: message.providerMessageId,
              organizationId,
              invoiceId,
              clientId,
              fromPhone: message.from,
              messageType: message.type,
              body: message.text.slice(0, 1000),
              intent: reply.intent,
              promisedDate: reply.promisedDate ?? null,
            },
          });
        } catch (error) {
          if (isUniqueViolation(error)) throw new DuplicateInboundMessage(); // Meta retried a message we already handled
          throw error;
        }
        await this.applyInboundReply(tx, message, reply, { organizationId, invoiceId, clientId }, now);
      });
    } catch (error) {
      if (error instanceof DuplicateInboundMessage) return;
      throw error;
    }
  }

  private async applyInboundReply(
    db: Prisma.TransactionClient,
    message: InboundMessage,
    reply: ReturnType<typeof classifyReply>,
    match: { organizationId: string | null; invoiceId: string | null; clientId: string | null },
    now: Date,
  ): Promise<void> {
    const { organizationId, invoiceId, clientId } = match;

    if (reply.intent === 'OPT_OUT') {
      // STOP must always be honoured, even as a reply to a receipt or with no reminder to tie it to:
      // fall back to whoever holds this phone number.
      const targets =
        organizationId && clientId
          ? [{ organizationId, clientId }]
          : await this.clientsByPhone(db, message.from, organizationId);
      if (targets.length === 0) {
        this.logger.warn(`Collections: STOP from ${message.providerMessageId} matched no customer; recorded only`);
      }
      for (const target of targets) await this.optOutClient(db, target.organizationId, target.clientId, now);
      return;
    }

    if (!organizationId) {
      this.logger.warn(`Collections: inbound message ${message.providerMessageId} matched no reminder; recorded only`);
      return;
    }
    if (!invoiceId) return;

    const collection = await db.invoiceCollection.findUnique({ where: { invoiceId } });
    if (!collection || collection.state === 'PAID' || collection.state === 'CLOSED') return;

    await db.invoiceCollectionReminder.updateMany({
      where: { invoiceId, status: 'PENDING_APPROVAL' },
      data: { status: 'SKIPPED', errorMessage: `customer_replied_${reply.intent.toLowerCase()}` },
    });

    if (reply.intent === 'WILL_PAY_ON' && reply.promisedDate) {
      await db.invoiceCollection.update({
        where: { invoiceId },
        data: { state: 'PROMISED', promisedDate: reply.promisedDate, nextActionAt: null, lastActionAt: now },
      });
    } else {
      // "I have paid" and anything unclear: stop chasing and let the owner look.
      await db.invoiceCollection.update({
        where: { invoiceId },
        data: { state: 'OWNER_ATTENTION', nextActionAt: null, lastActionAt: now },
      });
    }
  }

  /** Customers holding this WhatsApp number (saved in any free-text format), in one business or across all. */
  private async clientsByPhone(
    db: Prisma.TransactionClient,
    from: string,
    organizationId: string | null,
  ): Promise<{ organizationId: string; clientId: string }[]> {
    const digits = from.replace(/\D/g, '');
    if (!digits) return [];
    const variants = phoneDigitVariants('+' + digits);
    const rows = await db.$queryRaw<{ id: string; organization_id: string }[]>`
      SELECT id, organization_id FROM clients
      WHERE phone IS NOT NULL
        AND regexp_replace(phone, '[^0-9]', '', 'g') = ANY(${variants}::text[])
        ${organizationId ? Prisma.sql`AND organization_id = ${organizationId}` : Prisma.empty}
      LIMIT 50
    `;
    return rows.map((r) => ({ organizationId: r.organization_id, clientId: r.id }));
  }

  /** STOP: no more WhatsApp to this customer, and every queued or upcoming reminder to them is dropped. */
  private async optOutClient(db: Prisma.TransactionClient, organizationId: string, clientId: string, now: Date): Promise<void> {
    await db.client.updateMany({
      where: { id: clientId, organizationId },
      data: { whatsappOptIn: false, whatsappOptedOutAt: now },
    });
    await db.invoiceCollectionReminder.updateMany({
      where: { organizationId, status: 'PENDING_APPROVAL', invoice: { clientId } },
      data: { status: 'SKIPPED', errorMessage: 'customer_opted_out' },
    });
    await db.invoiceCollection.updateMany({
      where: { organizationId, state: { in: ['SCHEDULED', 'REMINDING', 'PROMISED'] }, invoice: { clientId } },
      data: { state: 'OWNER_ATTENTION', nextActionAt: null, lastActionAt: now },
    });
  }

  /** Invoices that need a person: a customer said they paid or wrote something unclear, or reminders ran out. */
  async listNeedingAttention(organizationId: string) {
    const collections = await this.prisma.invoiceCollection.findMany({
      where: { organizationId, state: 'OWNER_ATTENTION' },
      orderBy: { lastActionAt: 'desc' },
      take: 100,
      include: {
        invoice: { select: { id: true, invoiceNumber: true, total: true, amountPaid: true, dueDate: true, status: true, client: { select: { name: true } } } },
      },
    });
    const replies = await this.prisma.inboundWhatsappMessage.findMany({
      where: { organizationId, invoiceId: { in: collections.map((c) => c.invoiceId) } },
      orderBy: { createdAt: 'desc' },
      select: { invoiceId: true, body: true, intent: true, createdAt: true },
    });
    const latest = new Map<string, (typeof replies)[number]>();
    for (const r of replies) if (r.invoiceId && !latest.has(r.invoiceId)) latest.set(r.invoiceId, r);
    return collections.map((c) => ({
      invoiceId: c.invoiceId,
      messagesSent: c.messagesSent,
      lastActionAt: c.lastActionAt,
      invoice: c.invoice,
      lastReply: latest.get(c.invoiceId) ?? null,
    }));
  }
}
