import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, Prisma } from '@prisma/client';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { WalletService } from '../wallet/wallet.service';
import { encryptSecret, decryptSecret, resolvePayment } from '../../common';
import { SetupMoniepointDto } from './dto';

// Confirmed from Moniepoint's "Webhooks" developer docs. Purchases specifically — see
// Push Payment Request API Reference for the PURCHASE transactionType this mirrors.
const WEBHOOK_EVENT_TYPE = 'V1_POS_PURCHASE_TRANSACTION';

// We were previously only subscribing to WEBHOOK_EVENT_TYPE above, so attemptAmountReconciliation
// below could never fire for a transfer: Moniepoint was never asked to send transfer events in the
// first place, not a delivery failure on their end.
//
// CONFIRMED against real deliveries (2026-10-06): a customer transferring directly into a
// merchant's Moniepoint account comes through as eventType V1_POS_TRANSFER_TRANSACTION (NOT the
// unprefixed V1_TRANSFER_TRANSACTION, despite that name looking like the obvious match) — payload
// has transactionType: "POS_TRANSFER", transactionStatus: "APPROVED", and a `metaData` JSON string
// with customerName/customerAccountNumber/customerBank/narration (richer than attemptAmountReconciliation
// currently uses — worth matching on narration before falling back to amount, see its own comment).
// V1_TRANSFER_TRANSACTION is kept subscribed too since it's harmless (processIncomingWebhook
// no-ops gracefully on a shape it doesn't recognize) and its actual real-world trigger is still
// unconfirmed.
const TRANSFER_WEBHOOK_EVENT_TYPES = ['V1_TRANSFER_TRANSACTION', 'V1_POS_TRANSFER_TRANSACTION'];

// Mirrors OrdersService's PAYABLE_STATUSES — an order can still be auto-reconciled while
// OPEN/IN_KITCHEN/READY, or once a waiter has handed it to a cashier via markAwaitingPayment
// (CLOSED_UNPAID).
const PAYABLE_STATUSES: OrderStatus[] = [
  OrderStatus.OPEN,
  OrderStatus.IN_KITCHEN,
  OrderStatus.READY,
  OrderStatus.CLOSED_UNPAID,
];

// Both transfers and card swipes reconcile purely by amount — neither carries a merchantReference
// we control, since there's no push step anymore. A small tolerance absorbs bank-fee-sized
// discrepancies (e.g. the sender's bank shaving a few naira off a transfer); it deliberately does
// NOT widen to "closest match" — that would auto-confirm against a completely unrelated
// transaction just because it's the nearest in value, which risks marking the wrong order paid.
// Uniqueness within this band is still required; 2+ orders within tolerance falls back to manual
// reconciliation.
const AMOUNT_MATCH_TOLERANCE_KOBO = 5000; // ₦50

// How long before its real expiry we treat a cached OAuth token as stale, so we never fire a
// request with a token that expires mid-flight.
const TOKEN_REFRESH_BUFFER_MS = 60_000;

interface MoniepointAuthResponse {
  accessToken: string;
  expiresIn: number;
}

@Injectable()
export class MoniepointService {
  private readonly logger = new Logger(MoniepointService.name);
  private readonly baseUrl: string;
  private readonly posApiBaseUrl: string;
  private readonly encryptionKey: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private walletService: WalletService,
  ) {
    this.baseUrl = this.configService.get<string>('moniepoint.baseUrl') || 'https://channel.moniepoint.com';
    this.posApiBaseUrl = this.configService.get<string>('moniepoint.posApiBaseUrl') || 'https://api.pos.moniepoint.com';
    this.encryptionKey = this.configService.get<string>('moniepoint.encryptionKey') || '';
  }

  private async makeRequest<T>(endpoint: string, body: unknown, accessToken?: string, method: 'GET' | 'POST' = 'POST', baseUrlOverride?: string): Promise<T> {
    const url = `${baseUrlOverride ?? this.baseUrl}${endpoint}`;
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        },
        ...(method === 'POST' && { body: JSON.stringify(body) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // GlobalExceptionFilter only logs unhandled errors, not thrown HttpExceptions like this
        // one — without logging it here ourselves, a failed Moniepoint call (bad clientSecret,
        // invalid terminalSerial, businessId not found, ...) leaves zero server-side trace.
        this.logger.error(`Moniepoint API error on ${endpoint}: status=${response.status} message="${data?.message}" body=${JSON.stringify(data)}`);
        throw new BadRequestException(data?.message || `Moniepoint API error (${response.status})`);
      }
      return data as T;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Moniepoint API request to ${endpoint} failed`, error);
      throw new InternalServerErrorException('Failed to communicate with Moniepoint');
    }
  }

  /**
   * Restaurant self-onboarding: they enable ERP integration on their own Moniepoint business
   * console and generate a clientId/clientSecret scoped to their business — none of this comes
   * from Tarione. Overwrites any previous credentials and drops the cached token, since it was
   * minted for the old clientId/clientSecret pair.
   */
  async setupCredentials(organizationId: string, dto: SetupMoniepointDto) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        moniepointClientId: dto.clientId,
        moniepointClientSecretEncrypted: encryptSecret(dto.clientSecret, this.encryptionKey),
        moniepointBusinessId: dto.businessId,
        moniepointAccessToken: null,
        moniepointAccessTokenExpiresAt: null,
      },
    });

    return { success: true };
  }

  async getStatus(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        moniepointClientId: true,
        moniepointBusinessId: true,
        moniepointWebhookSubscriptionId: true,
        moniepointWebhookSecretEncrypted: true,
      },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return {
      // businessId deliberately excluded — it's usually only known after subscribeToWebhook
      // auto-detects it from the access token, which happens after this is already "set up".
      isSetup: !!organization.moniepointClientId,
      isWebhookSubscribed: !!organization.moniepointWebhookSubscriptionId,
      hasWebhookSecret: !!organization.moniepointWebhookSecretEncrypted,
    };
  }

  async disconnect(organizationId: string) {
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        moniepointClientId: null,
        moniepointClientSecretEncrypted: null,
        moniepointAccessToken: null,
        moniepointAccessTokenExpiresAt: null,
        moniepointBusinessId: null,
        moniepointWebhookSecretEncrypted: null,
        moniepointWebhookSubscriptionId: null,
      },
    });

    return { success: true };
  }

  /**
   * One-time (per org) call to tell Moniepoint where to POST transaction completion events.
   * Must be re-run if the org's public API base URL ever changes. The response does NOT include
   * a webhook secret — Moniepoint only shows that once, in the subscription's menu in their
   * dashboard, so it has to be entered separately via setWebhookSecret.
   */
  async subscribeToWebhook(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    if (!organization.moniepointClientId || !organization.moniepointClientSecretEncrypted) {
      throw new BadRequestException('Moniepoint POS is not set up for this organization');
    }

    const webhookBaseUrl = this.configService.get<string>('moniepoint.webhookBaseUrl');
    if (!webhookBaseUrl) {
      throw new InternalServerErrorException('MONIEPOINT_WEBHOOK_BASE_URL is not configured for this environment');
    }

    // api.pos.moniepoint.com (introspect, webhook-subscriptions, transactions) takes the raw
    // clientSecret directly as the Bearer value — Moniepoint's own app literally labels it "Your
    // API Key" on the credentials-generated screen, and this host's error for the OAuth access
    // token from channel.moniepoint.com's /v1/auth was "Invalid key provided.". No token exchange
    // for this host; getAccessToken()/the channel host's /v1/auth is a separate, apparently
    // legacy flow that may only apply there (kept around, unused by these two calls, in case
    // that turns out wrong).
    const apiKey = decryptSecret(organization.moniepointClientSecretEncrypted, this.encryptionKey);

    let businessId = organization.moniepointBusinessId ?? undefined;
    if (!businessId) {
      businessId = (await this.fetchBusinessIdFromIntrospect(apiKey)) ?? undefined;
      if (businessId) {
        this.logger.log(`Detected businessId ${businessId} from GET /v1/introspect for org ${organizationId}`);
        await this.prisma.organization.update({ where: { id: organizationId }, data: { moniepointBusinessId: businessId } });
      }
    }
    if (!businessId) {
      this.logger.error(`Could not determine businessId via GET /v1/introspect for org ${organizationId} — webhook subscription blocked`);
      throw new BadRequestException(
        "Couldn't determine your Moniepoint businessId automatically. Please re-run setup with businessId set explicitly (find it via Moniepoint support if it's not visible in your dashboard).",
      );
    }

    const endpointUrl = `${webhookBaseUrl.replace(/\/$/, '')}/api/v1/webhooks/moniepoint`;

    // Confirmed via a 404 ("No endpoint POST /v1/webhook-subscriptions") when this was first
    // tried on the "channel" host — this lives on posApiBaseUrl, same as /v1/introspect, not on
    // the "channel" host that /v1/auth and /v1/transactions use.
    const subscription = await this.makeRequest<{ id: string; endpointUrl: string; eventTypes: string[]; status: string }>(
      '/v1/webhook-subscriptions',
      {
        endpointUrl,
        eventTypes: [WEBHOOK_EVENT_TYPE, ...TRANSFER_WEBHOOK_EVENT_TYPES],
        // Moniepoint's schema wants this as a JSON number, not a string — safe to convert since
        // real values (confirmed up to 10 digits) are well within JS's safe-integer range.
        businessId: Number(businessId),
      },
      apiKey,
      'POST',
      this.posApiBaseUrl,
    );

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { moniepointWebhookSubscriptionId: subscription.id },
    });

    this.logger.log(`Moniepoint webhook subscription ${subscription.id} created for org ${organizationId} -> ${endpointUrl}`);
    return subscription;
  }

  /**
   * Looks up the business(es) associated with this API Key via Moniepoint's documented Key
   * Introspection endpoint — confirmed to return a `businesses: [{ id, businessName }]` array.
   * Lives on posApiBaseUrl (confirmed from docs.pos.moniepoint.com), authenticated with the raw
   * clientSecret/"API Key" directly as the Bearer value — not an OAuth token (see subscribeToWebhook).
   * Fails closed (returns null, logged) on ANY error rather than throwing — a wrong guess here
   * should degrade to the manual businessId field, not break the whole webhook subscription flow.
   * If more than one business is linked to this key we also bail out rather than picking arbitrarily.
   */
  private async fetchBusinessIdFromIntrospect(apiKey: string): Promise<string | null> {
    let result: { businesses?: { id: number; businessName: string }[] };
    try {
      result = await this.makeRequest<{ businesses?: { id: number; businessName: string }[] }>(
        '/v1/introspect',
        undefined,
        apiKey,
        'GET',
        this.posApiBaseUrl,
      );
    } catch (error) {
      this.logger.warn(`GET /v1/introspect at ${this.posApiBaseUrl} failed — falling back to manual businessId: ${error instanceof Error ? error.message : 'unknown error'}`);
      return null;
    }

    const businesses = result?.businesses ?? [];
    if (businesses.length === 0) {
      this.logger.warn('GET /v1/introspect returned no linked businesses for these credentials');
      return null;
    }
    if (businesses.length > 1) {
      this.logger.warn(
        `GET /v1/introspect returned ${businesses.length} linked businesses — can't safely auto-select one. ` +
          `Businesses: ${businesses.map((b) => `${b.id} (${b.businessName})`).join(', ')}`,
      );
      return null;
    }
    return String(businesses[0].id);
  }

  /**
   * Stores the webhook secret the restaurant copies out of their Moniepoint dashboard after
   * creating the subscription above — see subscribeToWebhook. Encrypted at rest like clientSecret.
   */
  async setWebhookSecret(organizationId: string, webhookSecret: string) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { moniepointWebhookSecretEncrypted: encryptSecret(webhookSecret, this.encryptionKey) },
    });

    return { success: true };
  }

  /**
   * Best-effort signature check. Moniepoint's docs confirm the header names and that it's a
   * Base64-encoded HMAC-SHA256, but their "Code Sample for Signature Verification" section
   * (which spells out exactly what string gets signed) wasn't retrievable — so the concatenation
   * below (`${webhookId}.${timestamp}.${rawBody}`, the common pattern used by Svix/Stripe-style
   * webhook providers) is an educated guess, NOT confirmed. Returns both signatures so the
   * caller can log them side by side on the first real delivery and correct this if they don't
   * match — see the TODO(security) on the controller.
   */
  verifyWebhookSignature(rawBody: string, webhookId: string, timestamp: string, receivedSignature: string, secret: string): { valid: boolean; computedSignature: string } {
    const signedPayload = `${webhookId}.${timestamp}.${rawBody}`;
    const computedSignature = createHmac('sha256', secret).update(signedPayload).digest('base64');
    return { valid: computedSignature === receivedSignature, computedSignature };
  }

  /**
   * Parses a real Moniepoint webhook delivery and routes it into attemptAmountReconciliation.
   * Neither a card swipe nor a bank transfer carries a merchantReference we control (there's no
   * push step anymore) — every delivery is classified by eventType/transactionType and
   * reconciled against open orders purely by amount.
   *
   * Logs a computed-vs-received signature comparison but does NOT reject on mismatch — see the
   * SECURITY GAP note on verifyWebhookSignature for why, and what has to change before this is safe.
   */
  async processIncomingWebhook(rawBody: string, webhookId: string, timestamp: string, signature: string) {
    let parsed: any;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }

    const data = parsed?.data ?? parsed;
    const transactionStatus: string | undefined = data?.transactionStatus;
    const responseCode: string | undefined = data?.responseCode;

    const eventType: string | undefined = parsed?.eventType ?? parsed?.type ?? parsed?.event;
    const dataTransactionType: string | undefined = data?.transactionType;
    this.logger.log(`Moniepoint webhook received — eventType="${eventType ?? 'unknown'}" transactionType="${dataTransactionType ?? 'unknown'}" status="${transactionStatus ?? 'unknown'}"`);

    if (webhookId && timestamp && signature) {
      const businessId: string | undefined = data?.businessId !== undefined ? String(data.businessId) : undefined;
      const organization = businessId ? await this.prisma.organization.findFirst({ where: { moniepointBusinessId: businessId } }) : null;
      if (organization?.moniepointWebhookSecretEncrypted) {
        const secret = decryptSecret(organization.moniepointWebhookSecretEncrypted, this.encryptionKey);
        const { valid, computedSignature } = this.verifyWebhookSignature(rawBody, webhookId, timestamp, signature, secret);
        if (!valid) {
          this.logger.warn(
            `Moniepoint webhook signature MISMATCH for org ${organization.id} — received="${signature}" computed="${computedSignature}". ` +
              `Not rejecting yet (algorithm unconfirmed — see SECURITY GAP), but this needs correcting before going live.`,
          );
        } else {
          this.logger.log(`Moniepoint webhook signature verified OK for org ${organization.id}`);
        }
      } else {
        this.logger.warn(`Could not verify webhook signature — no org/webhook secret resolved from businessId=${businessId ?? 'unknown'}`);
      }
    }

    if (transactionStatus === 'PENDING') {
      return { received: true, stillPending: true };
    }
    // Real deliveries have been observed using both 'APPROVED' and 'SUCCESSFUL' for success,
    // alongside a responseCode of '00' — accept any of the three rather than assuming one.
    const isSuccess = transactionStatus === 'APPROVED' || transactionStatus === 'SUCCESSFUL' || responseCode === '00';
    if (!isSuccess) {
      this.logger.log(`Moniepoint webhook not a success (status=${transactionStatus ?? 'unknown'}, responseCode=${responseCode ?? 'unknown'}) — nothing to reconcile.`);
      return { received: true };
    }

    const looksLikeTransfer =
      (typeof eventType === 'string' && eventType.toUpperCase().includes('TRANSFER')) ||
      (typeof dataTransactionType === 'string' && dataTransactionType.toUpperCase().includes('TRANSFER'));

    return this.attemptAmountReconciliation(data, looksLikeTransfer ? 'TRANSFER' : 'CARD');
  }

  /**
   * Reconciles a Moniepoint transaction (a card swipe on the restaurant's terminal, or a bank
   * transfer straight into the restaurant's known account) against an open order — purely by
   * amount, since neither carries a merchantReference we control. Auto-confirms only when exactly
   * one open order's outstanding balance falls within AMOUNT_MATCH_TOLERANCE_KOBO of the
   * transaction amount; any ambiguity (zero or multiple matches within tolerance) is logged and
   * left for manual reconciliation rather than guessed at, since a wrong auto-match would mark the
   * wrong order paid.
   */
  private async attemptAmountReconciliation(data: any, source: 'TRANSFER' | 'CARD'): Promise<{ received: boolean; reconciled?: boolean; reason?: string }> {
    // data.amount is in kobo — confirmed from real webhook payloads (e.g. amount:1081000 for a
    // ₦10,810 purchase). Orders store totals in plain Naira, so convert before comparing.
    const amount = Number(data?.amount) / 100;
    const businessId: string | undefined = data?.businessId !== undefined ? String(data.businessId) : undefined;
    const transactionReference: string | undefined = data?.transactionReference;
    const label = source === 'TRANSFER' ? 'Transfer' : 'Card payment';

    if (!amount || !businessId) {
      this.logger.warn(`${label} event missing amount or businessId — cannot reconcile. amount=${data?.amount} businessId=${data?.businessId}`);
      return { received: true, reason: 'Missing amount or businessId' };
    }

    const organization = await this.prisma.organization.findFirst({ where: { moniepointBusinessId: businessId } });
    if (!organization) {
      this.logger.warn(`${label} event for businessId ${businessId} — no matching organization found`);
      return { received: true, reason: 'No matching organization' };
    }

    const candidates = await this.prisma.order.findMany({
      where: { organizationId: organization.id, status: { in: PAYABLE_STATUSES } },
      include: { table: { select: { name: true } } },
    });
    const amountKobo = Math.round(amount * 100);
    const matches = candidates.filter(
      (o) => Math.abs(Math.round((Number(o.total) - Number(o.amountPaid)) * 100) - amountKobo) <= AMOUNT_MATCH_TOLERANCE_KOBO,
    );
    // Table name (falling back to the order source, e.g. "Hotel Room Service") plus the
    // outstanding balance — an order has no human-facing short code, only a UUID `id`, so this is
    // what actually lets a human reviewing matchReason tell two ambiguous candidates apart.
    const describeOrderForReview = (o: (typeof matches)[number]) =>
      `${o.table?.name ?? o.source} (₦${(Number(o.total) - Number(o.amountPaid)).toLocaleString()} due)`;

    this.logger.log(
      `${label} reconciliation for org ${organization.id}: amount=${amount} ref=${transactionReference ?? 'none'} — ` +
        `${candidates.length} open order(s), ${matches.length} within ±₦${AMOUNT_MATCH_TOLERANCE_KOBO / 100} of this amount` +
        (matches.length > 0 ? `: [${matches.map((o) => `${o.id} (₦${Number(o.total) - Number(o.amountPaid)})`).join(', ')}]` : ''),
    );

    if (matches.length !== 1) {
      const matchReason =
        matches.length === 0
          ? 'No matching order'
          : `Ambiguous — multiple matching orders: ${matches.map(describeOrderForReview).join(', ')}`;
      this.logger.warn(
        matches.length === 0
          ? `${label} of ₦${amount} for org ${organization.id} matched no open order — needs manual reconciliation.`
          : `${label} of ₦${amount} for org ${organization.id} matched ${matches.length} open orders — ambiguous, needs manual reconciliation. Candidates: ${matches.map((o) => o.id).join(', ')}`,
      );
      // Parse the nested metaData string (customerName/customerAccountNumber/customerBank/narration
      // on real transfer deliveries — see TRANSFER_WEBHOOK_EVENT_TYPES comment) so a human reviewing
      // this later has sender identity to go on, not just an amount. Card events don't carry this.
      let senderMetadata: Prisma.InputJsonValue | undefined;
      if (typeof data?.metaData === 'string') {
        try {
          senderMetadata = JSON.parse(data.metaData);
        } catch {
          senderMetadata = { raw: data.metaData };
        }
      }
      await this.prisma.moniepointUnreconciledTransfer.create({
        data: {
          organizationId: organization.id,
          amount,
          transactionReference,
          senderMetadata,
          matchReason,
          source,
        },
      });
      return { received: true, reconciled: false, reason: matches.length === 0 ? 'No matching order' : 'Ambiguous — multiple matching orders' };
    }

    const order = matches[0];
    const paymentMethod = source === 'TRANSFER' ? 'MONIEPOINT_TRANSFER' : 'MONIEPOINT_POS';
    await this.closeOrderForAutoMatch(organization.id, order, amount, transactionReference, paymentMethod);

    this.logger.log(`${label} of ₦${amount} auto-reconciled to order ${order.id} for org ${organization.id} (ref ${transactionReference ?? 'none'})`);
    return { received: true, reconciled: true };
  }

  // Shared by the auto-match path above and the manual "assign" endpoint below — closes the order,
  // records the Payment, deducts inventory, and flips the table, same as a normal reconciliation.
  // `recordedById` is only set on a manual assignment (a human picked this order); auto-matches
  // have no user to attribute it to.
  private async closeOrderForAutoMatch(
    organizationId: string,
    order: { id: string; total: Prisma.Decimal | number | string; amountPaid: Prisma.Decimal | number | string; tableId: string | null },
    amount: number,
    transactionReference: string | undefined,
    paymentMethod: string,
    recordedById?: string,
  ) {
    // Mirrors OrdersService.closeWithPayment's semantics exactly — amountPaid ACCUMULATES on top of
    // whatever's already been recorded (e.g. a prior partial cash payment), and the order only
    // actually closes once that total covers the bill; a transfer that's merely part of a split
    // payment leaves the order in CLOSED_UNPAID (still payable, still shows a running balance) for
    // the rest to be collected normally. The original version of this method set amountPaid to just
    // the transfer's own amount and force-closed unconditionally — harmless for the narrow case it
    // was written for (a transfer that happens to equal the *entire* outstanding balance, with
    // nothing paid before it), but silently wrong the moment any other payment touches the same
    // order, which the manual "Apply to Order" flow (assignUnreconciledTransfer) makes easy to hit.
    const outstandingBefore = Number(order.total) - Number(order.amountPaid);
    const varianceKobo = Math.round(outstandingBefore * 100) - Math.round(amount * 100);
    const rawAmountPaid = Math.round((Number(order.amountPaid) + amount) * 100) / 100;
    // A bank transfer this close to the full balance is treated as paid in full — the till rarely
    // moves exact kobo, and the restaurant doesn't chase a sub-₦1 remainder. See resolvePayment's
    // own comment; `amount` (what was actually received) still gets recorded as-is on the Payment
    // row below, only the Order's amountPaid/status reflect the write-off.
    const { amountPaid: newAmountPaid, isComplete: isFinalPayment, writeOff } = resolvePayment(rawAmountPaid, Number(order.total));
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id: order.id, status: { in: PAYABLE_STATUSES } },
        data: isFinalPayment
          ? { amountPaid: newAmountPaid, status: 'CLOSED_PAID', closedAt: new Date() }
          : { amountPaid: newAmountPaid, status: 'CLOSED_UNPAID' },
      });

      await tx.payment.create({
        data: {
          organizationId,
          orderId: order.id,
          recordedById,
          amount,
          paymentMethod,
          paymentDate: new Date(),
          moniepointReference: transactionReference,
          isAutoRecorded: !recordedById,
          notes:
            result.count === 0
              ? 'Received after order was already closed/cancelled — needs manual review'
              : !isFinalPayment
                ? `Partial payment — ₦${rawAmountPaid} of ₦${order.total} paid so far`
                : writeOff > 0
                  ? `Received ₦${amount} — ₦${writeOff} shortfall written off (within tolerance)`
                  : varianceKobo !== 0
                    ? `${recordedById ? 'Manually reconciled' : 'Auto-reconciled within tolerance'} — received ₦${amount}, outstanding was ₦${outstandingBefore} (₦${Math.abs(varianceKobo) / 100} ${varianceKobo > 0 ? 'short' : 'over'})`
                    : undefined,
        },
      });

      if (result.count === 0 || !isFinalPayment) return;

      await this.inventoryService.deductForOrder(tx, order.id, organizationId);
      if (order.tableId) {
        await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'NEEDS_CLEANING' } });
      }
    });
  }

  async listUnreconciledTransfers(organizationId: string, status?: 'PENDING_REVIEW' | 'RESOLVED' | 'IGNORED') {
    return this.prisma.moniepointUnreconciledTransfer.findMany({
      where: { organizationId, status: status ?? 'PENDING_REVIEW' },
      orderBy: { createdAt: 'desc' },
      include: {
        resolvedOrder: { select: { id: true, source: true, total: true, table: { select: { name: true } } } },
        resolvedCustomer: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async assignUnreconciledTransfer(organizationId: string, id: string, orderId: string, userId: string) {
    const transfer = await this.prisma.moniepointUnreconciledTransfer.findFirst({ where: { id, organizationId } });
    if (!transfer) {
      throw new NotFoundException('Unreconciled transfer not found');
    }
    if (transfer.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(`This transfer is already ${transfer.status.toLowerCase()}`);
    }

    const order = await this.prisma.order.findFirst({ where: { id: orderId, organizationId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const paymentMethod = transfer.source === 'CARD' ? 'MONIEPOINT_POS' : 'MONIEPOINT_TRANSFER';
    await this.closeOrderForAutoMatch(organizationId, order, Number(transfer.amount), transfer.transactionReference ?? undefined, paymentMethod, userId);

    return this.prisma.moniepointUnreconciledTransfer.update({
      where: { id },
      data: { status: 'RESOLVED', resolutionType: 'ORDER', resolvedOrderId: orderId, resolvedById: userId, resolvedAt: new Date() },
    });
  }

  // For a transfer that isn't for any order — the customer was topping up their wallet balance
  // by bank transfer rather than paying for an order. Credits the transfer's amount straight to
  // their wallet (same ledger WalletService.topUp uses for a CASH/CARD top-up), so the money is
  // actually accounted for rather than just dismissed.
  async resolveUnreconciledTransferToWallet(organizationId: string, id: string, customerId: string, userId: string, notes?: string) {
    const transfer = await this.prisma.moniepointUnreconciledTransfer.findFirst({ where: { id, organizationId } });
    if (!transfer) {
      throw new NotFoundException('Unreconciled transfer not found');
    }
    if (transfer.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(`This transfer is already ${transfer.status.toLowerCase()}`);
    }

    await this.walletService.topUp(organizationId, customerId, userId, {
      amount: Number(transfer.amount),
      paymentMethod: 'BANK_TRANSFER',
      reference: transfer.transactionReference ?? undefined,
      notes: notes ?? 'Wallet top-up via unreconciled Moniepoint transfer',
      // Deterministic from the transfer being resolved exactly once, rather than a fresh UUID —
      // a retry of this same resolve call (e.g. a dropped response) can't double-credit the wallet.
      clientRequestId: id,
    });

    return this.prisma.moniepointUnreconciledTransfer.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolutionType: 'WALLET_TOPUP',
        resolvedCustomerId: customerId,
        resolvedById: userId,
        resolvedAt: new Date(),
        resolutionNotes: notes,
      },
    });
  }

  async ignoreUnreconciledTransfer(organizationId: string, id: string, userId: string, notes?: string) {
    const transfer = await this.prisma.moniepointUnreconciledTransfer.findFirst({ where: { id, organizationId } });
    if (!transfer) {
      throw new NotFoundException('Unreconciled transfer not found');
    }
    if (transfer.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(`This transfer is already ${transfer.status.toLowerCase()}`);
    }

    return this.prisma.moniepointUnreconciledTransfer.update({
      where: { id },
      data: { status: 'IGNORED', resolutionType: 'OTHER', resolvedById: userId, resolvedAt: new Date(), resolutionNotes: notes },
    });
  }

  private async getAccessToken(organizationId: string, clientId: string, clientSecretEncrypted: string): Promise<string> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { moniepointAccessToken: true, moniepointAccessTokenExpiresAt: true },
    });

    if (
      organization?.moniepointAccessToken &&
      organization.moniepointAccessTokenExpiresAt &&
      organization.moniepointAccessTokenExpiresAt.getTime() - TOKEN_REFRESH_BUFFER_MS > Date.now()
    ) {
      return organization.moniepointAccessToken;
    }

    const clientSecret = decryptSecret(clientSecretEncrypted, this.encryptionKey);
    const auth = await this.makeRequest<MoniepointAuthResponse>('/v1/auth', { clientId, clientSecret });

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        moniepointAccessToken: auth.accessToken,
        moniepointAccessTokenExpiresAt: new Date(Date.now() + auth.expiresIn * 1000),
      },
    });

    return auth.accessToken;
  }

}
