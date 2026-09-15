import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { encryptSecret, decryptSecret } from '../../common';
import { SetupMoniepointDto } from './dto';

// Confirmed from Moniepoint's "Webhooks" developer docs. Purchases specifically — see
// Push Payment Request API Reference for the PURCHASE transactionType this mirrors.
const WEBHOOK_EVENT_TYPE = 'V1_POS_PURCHASE_TRANSACTION';

// Mirrors OrdersService's PAYABLE_STATUSES — an order can still take a payment push while
// OPEN/IN_KITCHEN/READY, or once a waiter has handed it to a cashier via markAwaitingPayment
// (CLOSED_UNPAID).
const PAYABLE_STATUSES: OrderStatus[] = [
  OrderStatus.OPEN,
  OrderStatus.IN_KITCHEN,
  OrderStatus.READY,
  OrderStatus.CLOSED_UNPAID,
];

// How long before its real expiry we treat a cached OAuth token as stale, so we never fire a
// push with a token that expires mid-flight.
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
  ) {
    this.baseUrl = this.configService.get<string>('moniepoint.baseUrl') || 'https://channel.moniepoint.com';
    this.posApiBaseUrl = this.configService.get<string>('moniepoint.posApiBaseUrl') || 'https://api.pos.moniepoint.com';
    this.encryptionKey = this.configService.get<string>('moniepoint.encryptionKey') || '';
  }

  private get isMockMode(): boolean {
    return this.configService.get<boolean>('moniepoint.mockMode') === true;
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
   * console, generate a clientId/clientSecret scoped to their business, and copy their
   * terminal's serial — none of this comes from Tarione. Overwrites any previous credentials
   * and drops the cached token, since it was minted for the old clientId/clientSecret pair.
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
        moniepointTerminalSerial: dto.terminalSerial,
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
        moniepointTerminalSerial: true,
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
      isSetup: !!(organization.moniepointClientId && organization.moniepointTerminalSerial),
      terminalSerial: organization.moniepointTerminalSerial,
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
        moniepointTerminalSerial: null,
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
        eventTypes: [WEBHOOK_EVENT_TYPE],
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
   * Parses a real Moniepoint webhook delivery and routes it into handleWebhookEvent. Payload
   * shape per their docs: a "data" object containing merchantReference, transactionStatus
   * (PENDING/APPROVED/...), responseMessage, etc. — different from the flat shape
   * handleWebhookEvent itself takes, which mock mode calls directly.
   *
   * Logs a computed-vs-received signature comparison but does NOT reject on mismatch — see the
   * SECURITY GAP note on handleWebhookEvent for why, and what has to change before this is safe.
   */
  async processIncomingWebhook(rawBody: string, webhookId: string, timestamp: string, signature: string) {
    let parsed: any;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }

    const data = parsed?.data ?? parsed;
    const merchantReference: string | undefined = data?.merchantReference;
    const transactionStatus: string | undefined = data?.transactionStatus;
    const responseMessage: string | undefined = data?.responseMessage;

    if (!merchantReference) {
      // Not something we pushed — either an organic in-person sale on the terminal (nothing to
      // do, we don't track those), or a bank transfer to the restaurant's known account, which we
      // CAN try to reconcile against an open order by amount. See attemptTransferReconciliation.
      const eventType: string | undefined = parsed?.eventType ?? parsed?.type ?? parsed?.event;
      this.logger.log(`Moniepoint webhook payload missing data.merchantReference — eventType="${eventType ?? 'unknown'}" topLevelKeys=[${Object.keys(parsed ?? {}).join(', ')}]`);

      if (typeof eventType === 'string' && eventType.toUpperCase().includes('TRANSFER')) {
        return this.attemptTransferReconciliation(data);
      }

      return { received: true };
    }

    const transaction = await this.prisma.moniepointTransaction.findUnique({ where: { merchantReference } });
    if (!transaction) {
      this.logger.warn(`Moniepoint webhook for unknown reference ${merchantReference}`);
      return { received: true, reason: 'Unknown reference' };
    }

    if (webhookId && timestamp && signature) {
      const organization = await this.prisma.organization.findUnique({
        where: { id: transaction.organizationId },
        select: { moniepointWebhookSecretEncrypted: true },
      });
      if (organization?.moniepointWebhookSecretEncrypted) {
        const secret = decryptSecret(organization.moniepointWebhookSecretEncrypted, this.encryptionKey);
        const { valid, computedSignature } = this.verifyWebhookSignature(rawBody, webhookId, timestamp, signature, secret);
        if (!valid) {
          this.logger.warn(
            `Moniepoint webhook signature MISMATCH for ${merchantReference} — received="${signature}" computed="${computedSignature}". ` +
              `Not rejecting yet (algorithm unconfirmed — see SECURITY GAP), but this needs correcting before going live.`,
          );
        } else {
          this.logger.log(`Moniepoint webhook signature verified OK for ${merchantReference}`);
        }
      } else {
        this.logger.warn(`No webhook secret stored for org ${transaction.organizationId} — cannot verify signature for ${merchantReference}. Run setWebhookSecret first.`);
      }
    }

    if (transactionStatus === 'PENDING') {
      return { received: true, stillPending: true };
    }

    const status = transactionStatus === 'APPROVED' ? 'SUCCESS' : 'FAILED';
    return this.handleWebhookEvent({
      merchantReference,
      status,
      failureReason: status === 'FAILED' ? responseMessage || `transactionStatus=${transactionStatus}` : undefined,
    });
  }

  /**
   * Reconciles a bank transfer (paid to the restaurant's own known account, not a dynamic
   * per-order virtual account) against an open order — by amount, since a transfer carries no
   * merchantReference we control. Auto-confirms only when exactly one open order currently has
   * that exact outstanding balance; any ambiguity (zero or multiple matches) is logged and left
   * for manual reconciliation rather than guessed at, since a wrong auto-match would mark the
   * wrong order paid. NOTE: the exact webhook payload shape for a transfer event is unconfirmed
   * (we've only observed real Purchase events so far) — this assumes the same data.amount /
   * data.businessId / data.transactionReference fields documented for purchases.
   */
  private async attemptTransferReconciliation(data: any): Promise<{ received: boolean; reconciled?: boolean; reason?: string }> {
    const amount = Number(data?.amount);
    const businessId: string | undefined = data?.businessId !== undefined ? String(data.businessId) : undefined;
    const transactionReference: string | undefined = data?.transactionReference;

    if (!amount || !businessId) {
      this.logger.warn(`Transfer event missing amount or businessId — cannot reconcile. amount=${data?.amount} businessId=${data?.businessId}`);
      return { received: true, reason: 'Missing amount or businessId' };
    }

    const organization = await this.prisma.organization.findFirst({ where: { moniepointBusinessId: businessId } });
    if (!organization) {
      this.logger.warn(`Transfer event for businessId ${businessId} — no matching organization found`);
      return { received: true, reason: 'No matching organization' };
    }

    const candidates = await this.prisma.order.findMany({
      where: { organizationId: organization.id, status: { in: PAYABLE_STATUSES } },
    });
    const matches = candidates.filter((o) => Math.round((Number(o.total) - Number(o.amountPaid)) * 100) === Math.round(amount * 100));

    this.logger.log(
      `Transfer reconciliation for org ${organization.id}: amount=${amount} ref=${transactionReference ?? 'none'} — ` +
        `${candidates.length} open order(s), ${matches.length} matching this amount` +
        (matches.length > 0 ? `: [${matches.map((o) => `${o.id} (₦${Number(o.total) - Number(o.amountPaid)})`).join(', ')}]` : ''),
    );

    if (matches.length !== 1) {
      this.logger.warn(
        matches.length === 0
          ? `Transfer of ₦${amount} for org ${organization.id} matched no open order — needs manual reconciliation.`
          : `Transfer of ₦${amount} for org ${organization.id} matched ${matches.length} open orders — ambiguous, needs manual reconciliation. Candidates: ${matches.map((o) => o.id).join(', ')}`,
      );
      return { received: true, reconciled: false, reason: matches.length === 0 ? 'No matching order' : 'Ambiguous — multiple matching orders' };
    }

    const order = matches[0];
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id: order.id, status: { in: PAYABLE_STATUSES } },
        data: { amountPaid: amount, status: 'CLOSED_PAID', closedAt: new Date() },
      });

      await tx.payment.create({
        data: {
          organizationId: organization.id,
          orderId: order.id,
          amount,
          paymentMethod: 'MONIEPOINT_TRANSFER',
          paymentDate: new Date(),
          moniepointReference: transactionReference,
          isAutoRecorded: true,
          notes: result.count === 0 ? 'Received after order was already closed/cancelled — needs manual review' : undefined,
        },
      });

      if (result.count === 0) return;

      await this.inventoryService.deductForOrder(tx, order.id, organization.id);
      if (order.tableId) {
        await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'NEEDS_CLEANING' } });
      }
    });

    this.logger.log(`Transfer of ₦${amount} auto-reconciled to order ${order.id} for org ${organization.id} (ref ${transactionReference ?? 'none'})`);
    return { received: true, reconciled: true };
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

  /**
   * Pushes the order's amount to the restaurant's own physical terminal — the customer then
   * taps/inserts their card on that device. Returns immediately once Moniepoint has queued the
   * transaction (202 Accepted); actual success/failure only arrives later via webhook (see
   * handleWebhookEvent), or — in mock mode — a simulated timer standing in for that webhook.
   */
  async pushOrderPayment(organizationId: string, orderId: string, amount?: number) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    if (!this.isMockMode && (!organization.moniepointClientId || !organization.moniepointClientSecretEncrypted || !organization.moniepointTerminalSerial)) {
      throw new BadRequestException('Moniepoint POS is not set up for this organization');
    }

    const order = await this.prisma.order.findFirst({ where: { id: orderId, organizationId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (!PAYABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(`Cannot push payment for a ${order.status.toLowerCase()} order`);
    }

    const existingPending = await this.prisma.moniepointTransaction.findFirst({
      where: { orderId, status: 'PENDING' },
    });
    if (existingPending) {
      throw new BadRequestException('A payment push is already pending for this order — wait for it to complete or fail before retrying');
    }

    const pushAmount = amount ?? Number(order.total) - Number(order.amountPaid);
    const terminalSerial = organization.moniepointTerminalSerial || 'MOCK-TERMINAL';
    const merchantReference = `MNP-${order.id.slice(0, 8)}-${Date.now()}`;

    const transaction = await this.prisma.moniepointTransaction.create({
      data: {
        organizationId,
        orderId,
        merchantReference,
        terminalSerial,
        amount: pushAmount,
        status: 'PENDING',
      },
    });

    if (this.isMockMode) {
      this.logger.log(`[MOCK] Simulating Moniepoint POS push for order ${orderId} (ref ${merchantReference})`);
      setTimeout(() => {
        this.handleWebhookEvent({ merchantReference, status: 'SUCCESS' }).catch((err) =>
          this.logger.error(`Mock Moniepoint completion failed for ${merchantReference}: ${err.message}`),
        );
      }, 5000);
      return { merchantReference, status: transaction.status, amount: pushAmount };
    }

    try {
      // On posApiBaseUrl, authenticated with the raw clientSecret/"API Key" directly as the
      // Bearer value — not an OAuth token from channel.moniepoint.com/v1/auth. See
      // subscribeToWebhook for why (Moniepoint's own app literally labels this value "Your API
      // Key", and that host's own error for an OAuth token was "Invalid key provided.").
      const apiKey = decryptSecret(organization.moniepointClientSecretEncrypted!, this.encryptionKey);
      await this.makeRequest(
        '/v1/transactions',
        {
          terminalSerial,
          amount: Math.round(pushAmount),
          merchantReference,
          transactionType: 'PURCHASE',
          // Required per Moniepoint's real interactive docs (docs.pos.moniepoint.com) — we were
          // never sending this. The API accepted requests and returned success without it, but
          // very plausibly never actually knew how to route the transaction (card entry vs.
          // transfer vs. generic) without it — likely explains why nothing ever reached the
          // terminal despite clean success responses on every prior attempt.
          paymentMethod: 'CARD_PURCHASE',
        },
        apiKey,
        'POST',
        this.posApiBaseUrl,
      );
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Moniepoint push failed for order ${orderId} (ref ${merchantReference}): ${failureReason}`);
      await this.prisma.moniepointTransaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED', failureReason, completedAt: new Date() },
      });
      throw error;
    }

    return { merchantReference, status: transaction.status, amount: pushAmount };
  }

  async getTransactionStatus(organizationId: string, merchantReference: string) {
    const transaction = await this.prisma.moniepointTransaction.findFirst({
      where: { merchantReference, organizationId },
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  /**
   * Handles a completion notification for a pushed transaction — from a real Moniepoint webhook,
   * or the mock-mode simulator above.
   *
   * SECURITY GAP: the controller logs a computed-vs-received signature comparison (see
   * verifyWebhookSignature) but does NOT reject on mismatch yet, because the exact signed-string
   * format is still an educated guess, not confirmed against a real delivery. Once a real webhook
   * has been observed and the guess confirmed/corrected, the controller must start rejecting
   * mismatches with 400 before this method ever runs — right now it doesn't, and this endpoint
   * MUST NOT be trusted in production as-is.
   */
  async handleWebhookEvent(payload: { merchantReference: string; status: 'SUCCESS' | 'FAILED'; failureReason?: string }) {
    const { merchantReference, status, failureReason } = payload;

    const transaction = await this.prisma.moniepointTransaction.findUnique({ where: { merchantReference } });
    if (!transaction) {
      this.logger.warn(`Moniepoint webhook for unknown reference ${merchantReference}`);
      return { received: true, reason: 'Unknown reference' };
    }
    if (transaction.status !== 'PENDING') {
      this.logger.log(`Moniepoint transaction ${merchantReference} already resolved (${transaction.status}), skipping.`);
      return { received: true, alreadyProcessed: true };
    }

    if (status === 'FAILED') {
      await this.prisma.moniepointTransaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED', failureReason: failureReason || 'Declined at terminal', completedAt: new Date() },
      });
      return { received: true, success: false };
    }

    const order = await this.prisma.order.findUnique({ where: { id: transaction.orderId } });
    if (!order) {
      this.logger.error(`Moniepoint reconciliation failed: order ${transaction.orderId} not found for ${merchantReference}`);
      return { received: true, success: false, reason: 'Order not found' };
    }

    const amount = Number(transaction.amount);

    await this.prisma.$transaction(async (tx) => {
      const doubleCheck = await tx.moniepointTransaction.findUnique({ where: { id: transaction.id } });
      if (doubleCheck?.status !== 'PENDING') return;

      await tx.moniepointTransaction.update({
        where: { id: transaction.id },
        data: { status: 'SUCCESS', completedAt: new Date() },
      });

      // Conditional update guards against a concurrent close (e.g. a cashier closing with cash
      // while this push was still in flight) racing past the PAYABLE_STATUSES check above.
      const result = await tx.order.updateMany({
        where: { id: order.id, status: { in: PAYABLE_STATUSES } },
        data: { amountPaid: amount, status: 'CLOSED_PAID', closedAt: new Date() },
      });

      await tx.payment.create({
        data: {
          organizationId: order.organizationId,
          orderId: order.id,
          amount,
          paymentMethod: 'MONIEPOINT_POS',
          paymentDate: new Date(),
          moniepointReference: merchantReference,
          isAutoRecorded: true,
          notes: result.count === 0 ? 'Received after order was already closed/cancelled — needs manual review' : undefined,
        },
      });

      if (result.count === 0) {
        this.logger.warn(`Order ${order.id} was already closed/cancelled by the time Moniepoint ref ${merchantReference} confirmed — payment recorded but order left unchanged.`);
        return;
      }

      await this.inventoryService.deductForOrder(tx, order.id, order.organizationId);

      if (order.tableId) {
        await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'NEEDS_CLEANING' } });
      }
    });

    this.logger.log(`Moniepoint POS payment recorded for order ${order.id} (ref ${merchantReference})`);
    return { received: true, success: true };
  }
}
