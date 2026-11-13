import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoyaltyMessageKind, Prisma } from '@prisma/client';
import { normalisePhone } from '../../common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { moneyFormatter, rewardEarnedValues, RewardMessagePayload, welcomeValues } from './loyalty.messages';

const MAX_ATTEMPTS = 3;
const PER_ORG_PER_RUN = 20; // one restaurant's backlog can't starve the others or flood the shared sender
const PER_RUN = 150;
const RETRY_MINUTES = 10;
const STALE_HOURS = 48;

type Outcome = 'SENT' | 'SKIPPED' | 'RETRY' | 'FAILED';

interface ClaimedRow {
  id: string;
  organization_id: string;
  customer_id: string;
  kind: LoyaltyMessageKind;
  payload: Prisma.JsonValue;
  attempts: number;
}

/**
 * Sends the queued customer messages (welcome, reward earned). Runs every minute; safe to run on
 * several instances at once because rows are claimed with a single conditional UPDATE.
 */
@Injectable()
export class LoyaltySender {
  private readonly logger = new Logger(LoyaltySender.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly config: ConfigService,
  ) {}

  private get enabled(): boolean {
    return this.config.get<boolean>('whatsapp.loyaltyMessagesEnabled') === true;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async run() {
    try {
      // Anything that has waited too long (messaging switched off, a long outage) is dropped
      // rather than sent days late or left to pile up.
      await this.prisma.$executeRaw`
        UPDATE loyalty_messages SET status = 'SKIPPED', last_error = 'Not sent in time'
        WHERE status = 'PENDING' AND created_at < now() - (${STALE_HOURS} * interval '1 hour')
      `;
      if (!this.enabled) return;

      const claimed = await this.claim();
      const tally = { SENT: 0, SKIPPED: 0, RETRY: 0, FAILED: 0 };
      for (const row of claimed) tally[await this.deliver(row)]++;
      if (claimed.length) {
        this.logger.log(`Loyalty messages: ${claimed.length} picked up — ${tally.SENT} sent, ${tally.SKIPPED} skipped, ${tally.RETRY} will retry, ${tally.FAILED} failed`);
      }
    } catch (err) {
      this.logger.error(`Loyalty message run failed: ${(err as Error).message}`);
    }
  }

  /** Takes a fair slice of due messages: at most PER_ORG_PER_RUN per organization. */
  private async claim(): Promise<ClaimedRow[]> {
    const due = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM (
        SELECT id, row_number() OVER (PARTITION BY organization_id ORDER BY created_at) AS rn, created_at
        FROM loyalty_messages
        WHERE status = 'PENDING' AND next_attempt_at <= now()
      ) due
      WHERE rn <= ${PER_ORG_PER_RUN}
      ORDER BY created_at
      LIMIT ${PER_RUN}
    `;
    if (due.length === 0) return [];
    // The claim re-checks "still pending and due", so a second worker racing this one gets nothing.
    return this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE loyalty_messages
      SET attempts = attempts + 1, next_attempt_at = now() + (${RETRY_MINUTES} * interval '1 minute')
      WHERE id = ANY(${due.map((d) => d.id)}::text[]) AND status = 'PENDING' AND next_attempt_at <= now()
      RETURNING id, organization_id, customer_id, kind, payload, attempts
    `;
  }

  // What happened to one message — logged per message (ids only, never phone numbers or names) so
  // "was it sent, and if not why not" can be read straight from the logs.
  private async skip(row: ClaimedRow, reason: string): Promise<Outcome> {
    await this.prisma.loyaltyMessage.update({ where: { id: row.id }, data: { status: 'SKIPPED', lastError: reason } });
    this.logger.warn(`Loyalty ${row.kind} message ${row.id} (org ${row.organization_id}) SKIPPED: ${reason}`);
    return 'SKIPPED';
  }

  private async deliver(row: ClaimedRow): Promise<Outcome> {
    const [org, customer] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: row.organization_id }, select: { name: true, currency: true, phoneCountry: true, loyaltyEnabled: true, isTestAccount: true } }),
      this.prisma.customer.findUnique({ where: { id: row.customer_id }, select: { name: true, phone: true, isMember: true, messageConsentAt: true } }),
    ]);
    if (!org || !customer || !org.loyaltyEnabled || !customer.isMember) return this.skip(row, 'Loyalty is off or the customer is not a member');
    // Demo and test organizations hold made-up customers whose numbers can look real: never message them.
    if (org.isTestAccount) return this.skip(row, 'Test or demo organization: messages are never sent');
    if (!customer.messageConsentAt) return this.skip(row, 'No message consent recorded');
    const phone = customer.phone ? normalisePhone(customer.phone, org.phoneCountry) : null;
    if (!phone || !phone.ok) return this.skip(row, 'No valid phone number');

    let templateName: string;
    let bodyValues: string[];
    if (row.kind === 'WELCOME') {
      const rules = await this.prisma.loyaltyRewardRule.findMany({
        where: { organizationId: row.organization_id, isActive: true, items: { some: {} } },
        orderBy: { sortOrder: 'asc' },
        select: { name: true, thresholdAmount: true, items: { select: { menuItem: { select: { name: true } } } } },
      });
      const values = welcomeValues(customer.name, org.name, rules, moneyFormatter(org.currency));
      // The approved welcome template describes exactly two rewards.
      if (!values) return this.skip(row, 'The welcome message template needs exactly two active rewards');
      bodyValues = values;
      templateName = this.config.get<string>('whatsapp.loyaltyWelcomeTemplateName') || 'loyalty_welcome_v1';
    } else {
      bodyValues = rewardEarnedValues(customer.name, org.name, row.payload as unknown as RewardMessagePayload);
      templateName = this.config.get<string>('whatsapp.loyaltyRewardTemplateName') || 'loyalty_reward_earned_v1';
    }

    try {
      const { providerMessageId } = await this.whatsapp.sendCustomerTemplate({
        organizationId: row.organization_id,
        toPhone: phone.e164,
        templateName,
        bodyValues,
      });
      await this.prisma.loyaltyMessage.update({
        where: { id: row.id },
        data: { status: 'SENT', sentAt: new Date(), providerMessageId, lastError: null },
      });
      // Accepted by WhatsApp. Whether it then reaches the phone is reported later by Meta's delivery receipt.
      this.logger.log(`Loyalty ${row.kind} message ${row.id} (org ${row.organization_id}) SENT to WhatsApp as ${templateName}${providerMessageId ? '' : ' (mock mode: nothing was really sent)'}`);
      return 'SENT';
    } catch (err) {
      const message = (err as Error).message;
      // Out of attempts: FAILED (a failed welcome appears in the Welcome queue). Otherwise the
      // claim already pushed the next attempt back, so it simply stays PENDING.
      const final = row.attempts >= MAX_ATTEMPTS;
      await this.prisma.loyaltyMessage.update({
        where: { id: row.id },
        data: final ? { status: 'FAILED', lastError: message } : { lastError: message },
      });
      this.logger.warn(`Loyalty ${row.kind} message ${row.id} (org ${row.organization_id}) ${final ? 'FAILED for good' : `failed, will retry (attempt ${row.attempts} of ${MAX_ATTEMPTS})`}: ${message}`);
      return final ? 'FAILED' : 'RETRY';
    }
  }
}
