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
import { encryptSecret, decryptSecret } from '../../common';
import { SetupMoniepointDto } from './dto';

// Confirmed from Moniepoint's "Webhooks" developer docs. Purchases specifically — see
// Push Payment Request API Reference for the PURCHASE transactionType this mirrors.
const WEBHOOK_EVENT_TYPE = 'V1_POS_PURCHASE_TRANSACTION';

// We were previously only subscribing to WEBHOOK_EVENT_TYPE above, so attemptTransferReconciliation
// below could never fire: Moniepoint was never asked to send transfer events in the first place,
// not a delivery failure on their end.
//
// CONFIRMED against real deliveries (2026-10-06): a customer transferring directly into a
// merchant's Moniepoint account comes through as eventType V1_POS_TRANSFER_TRANSACTION (NOT the
// unprefixed V1_TRANSFER_TRANSACTION, despite that name looking like the obvious match) — payload
// has transactionType: "POS_TRANSFER", transactionStatus: "APPROVED", and a `metaData` JSON string
// with customerName/customerAccountNumber/customerBank/narration (richer than attemptTransferReconciliation
// currently uses — worth matching on narration before falling back to amount, see its own comment).
// V1_TRANSFER_TRANSACTION is kept subscribed too since it's harmless (processIncomingWebhook
// no-ops gracefully on a shape it doesn't recognize) and its actual real-world trigger is still
// unconfirmed.
const TRANSFER_WEBHOOK_EVENT_TYPES = ['V1_TRANSFER_TRANSACTION', 'V1_POS_TRANSFER_TRANSACTION'];

// Mirrors OrdersService's PAYABLE_STATUSES — an order can still take a payment push while
// OPEN/IN_KITCHEN/READY, or once a waiter has handed it to a cashier via markAwaitingPayment
// (CLOSED_UNPAID).
const PAYABLE_STATUSES: OrderStatus[] = [
  OrderStatus.OPEN,
  OrderStatus.IN_KITCHEN,
  OrderStatus.READY,
  OrderStatus.CLOSED_UNPAID,
];

// Transfer reconciliation matches by amount (a transfer carries no merchantReference we control).
// A small tolerance absorbs bank-fee-sized discrepancies (e.g. the sender's bank shaving a few
// naira off); it deliberately does NOT widen to "closest match" — that would auto-confirm against
// a completely unrelated transfer just because it's the nearest in value, which risks marking the
// wrong order paid. Uniqueness within this band is still required; 2+ orders within tolerance
// falls back to manual reconciliation same as before.
const TRANSFER_AMOUNT_TOLERANCE_KOBO = 5000; // ₦50

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
    private walletService: WalletService,
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
   * console and generate a clientId/clientSecret scoped to their business — none of this comes
   * from Tarione. One business account can have several physical terminals under it (see
   * MoniepointTerminal), so no terminal serial is set here; add at least one via
   * createTerminal/updateTerminal before a payment can actually be pushed. Overwrites any
   * previous credentials and drops the cached token, since it was minted for the old
   * clientId/clientSecret pair.
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

    const terminals = await this.listTerminals(organizationId);

    return {
      // businessId deliberately excluded — it's usually only known after subscribeToWebhook
      // auto-detects it from the access token, which happens after this is already "set up".
      // Credentials and terminals are independent: isSetup reflects the business account only —
      // a connected account with zero terminals still can't actually push a payment, which the
      // frontend derives from `terminals` itself rather than a second combined flag here.
      isSetup: !!organization.moniepointClientId,
      terminals,
      isWebhookSubscribed: !!organization.moniepointWebhookSubscriptionId,
      hasWebhookSecret: !!organization.moniepointWebhookSecretEncrypted,
    };
  }

  async disconnect(organizationId: string) {
    await this.prisma.$transaction([
      this.prisma.moniepointTerminal.deleteMany({ where: { organizationId } }),
      this.prisma.organization.update({
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
      }),
    ]);

    return { success: true };
  }

  async listTerminals(organizationId: string) {
    return this.prisma.moniepointTerminal.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createTerminal(organizationId: string, serial: string, label: string) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    if (!organization.moniepointClientId) {
      throw new BadRequestException('Connect your Moniepoint business account before adding a terminal');
    }

    try {
      return await this.prisma.moniepointTerminal.create({
        data: { organizationId, serial, label },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('A terminal with this serial is already registered for your organization');
      }
      throw error;
    }
  }

  async updateTerminal(organizationId: string, id: string, data: { serial?: string; label?: string; isActive?: boolean }) {
    const terminal = await this.prisma.moniepointTerminal.findFirst({ where: { id, organizationId } });
    if (!terminal) {
      throw new NotFoundException('Terminal not found');
    }

    try {
      return await this.prisma.moniepointTerminal.update({ where: { id }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('A terminal with this serial is already registered for your organization');
      }
      throw error;
    }
  }

  async removeTerminal(organizationId: string, id: string) {
    const terminal = await this.prisma.moniepointTerminal.findFirst({ where: { id, organizationId } });
    if (!terminal) {
      throw new NotFoundException('Terminal not found');
    }

    await this.prisma.moniepointTerminal.delete({ where: { id } });
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
    const responseCode: string | undefined = data?.responseCode;

    if (!merchantReference) {
      // Not something we pushed — either an organic in-person sale on the terminal (nothing to
      // do, we don't track those), or a bank transfer to the restaurant's known account, which we
      // CAN try to reconcile against an open order by amount. See attemptTransferReconciliation.
      const eventType: string | undefined = parsed?.eventType ?? parsed?.type ?? parsed?.event;
      this.logger.log(`Moniepoint webhook payload missing data.merchantReference — eventType="${eventType ?? 'unknown'}" topLevelKeys=[${Object.keys(parsed ?? {}).join(', ')}]`);
      // Temporary: full payload, to nail down what a Transfer event actually looks like (every
      // real event observed so far has been V1_POS_PURCHASE_TRANSACTION — never confirmed a
      // transfer's shape). Remove once that's confirmed.
      this.logger.log(`Moniepoint webhook full payload: ${JSON.stringify(parsed)}`);

      // Confirmed real payload shape (from V1_POS_PURCHASE_TRANSACTION events) nests a second,
      // more specific transactionType inside `data` (e.g. "PURCHASE") alongside the top-level
      // eventType — check both, since we don't yet know for certain which one actually varies
      // for a transfer (never observed one).
      const dataTransactionType: string | undefined = data?.transactionType;
      const looksLikeTransfer =
        (typeof eventType === 'string' && eventType.toUpperCase().includes('TRANSFER')) ||
        (typeof dataTransactionType === 'string' && dataTransactionType.toUpperCase().includes('TRANSFER'));

      if (looksLikeTransfer) {
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

    const isSuccessful =
      transactionStatus === 'APPROVED' ||
      transactionStatus === 'SUCCESSFUL' ||
      responseCode === '00';
    const status = isSuccessful ? 'SUCCESS' : 'FAILED';
    return this.handleWebhookEvent({
      merchantReference,
      status,
      failureReason: status === 'FAILED' ? responseMessage || `transactionStatus=${transactionStatus}` : undefined,
    });
  }

  /**
   * Reconciles a bank transfer (paid to the restaurant's own known account, not a dynamic
   * per-order virtual account) against an open order — by amount, since a transfer carries no
   * merchantReference we control. Auto-confirms only when exactly one open order's outstanding
   * balance falls within TRANSFER_AMOUNT_TOLERANCE_KOBO of the transferred amount; any ambiguity
   * (zero or multiple matches within tolerance) is logged and left for manual reconciliation
   * rather than guessed at, since a wrong auto-match would mark the wrong order paid. NOTE: the
   * exact webhook payload shape for a transfer event is unconfirmed (we've only observed real
   * Purchase events so far) — this assumes the same data.amount / data.businessId /
   * data.transactionReference fields documented for purchases.
   */
  private async attemptTransferReconciliation(data: any): Promise<{ received: boolean; reconciled?: boolean; reason?: string }> {
    // data.amount is in kobo — confirmed from real webhook payloads (e.g. amount:1081000 for a
    // ₦10,810 purchase). Orders store totals in plain Naira, so convert before comparing.
    const amount = Number(data?.amount) / 100;
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
      include: { table: { select: { name: true } } },
    });
    const amountKobo = Math.round(amount * 100);
    const matches = candidates.filter(
      (o) => Math.abs(Math.round((Number(o.total) - Number(o.amountPaid)) * 100) - amountKobo) <= TRANSFER_AMOUNT_TOLERANCE_KOBO,
    );
    // Table name (falling back to the order source, e.g. "Hotel Room Service") plus the
    // outstanding balance — an order has no human-facing short code, only a UUID `id`, so this is
    // what actually lets a human reviewing matchReason tell two ambiguous candidates apart.
    const describeOrderForReview = (o: (typeof matches)[number]) =>
      `${o.table?.name ?? o.source} (₦${(Number(o.total) - Number(o.amountPaid)).toLocaleString()} due)`;

    this.logger.log(
      `Transfer reconciliation for org ${organization.id}: amount=${amount} ref=${transactionReference ?? 'none'} — ` +
        `${candidates.length} open order(s), ${matches.length} within ±₦${TRANSFER_AMOUNT_TOLERANCE_KOBO / 100} of this amount` +
        (matches.length > 0 ? `: [${matches.map((o) => `${o.id} (₦${Number(o.total) - Number(o.amountPaid)})`).join(', ')}]` : ''),
    );

    if (matches.length !== 1) {
      const matchReason =
        matches.length === 0
          ? 'No matching order'
          : `Ambiguous — multiple matching orders: ${matches.map(describeOrderForReview).join(', ')}`;
      this.logger.warn(
        matches.length === 0
          ? `Transfer of ₦${amount} for org ${organization.id} matched no open order — needs manual reconciliation.`
          : `Transfer of ₦${amount} for org ${organization.id} matched ${matches.length} open orders — ambiguous, needs manual reconciliation. Candidates: ${matches.map((o) => o.id).join(', ')}`,
      );
      // Parse the nested metaData string (customerName/customerAccountNumber/customerBank/narration
      // on real transfer deliveries — see TRANSFER_WEBHOOK_EVENT_TYPES comment) so a human reviewing
      // this later has sender identity to go on, not just an amount.
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
        },
      });
      return { received: true, reconciled: false, reason: matches.length === 0 ? 'No matching order' : 'Ambiguous — multiple matching orders' };
    }

    const order = matches[0];
    await this.closeOrderForTransfer(organization.id, order, amount, transactionReference);

    this.logger.log(`Transfer of ₦${amount} auto-reconciled to order ${order.id} for org ${organization.id} (ref ${transactionReference ?? 'none'})`);
    return { received: true, reconciled: true };
  }

  // Shared by the auto-match path above and the manual "assign" endpoint below — closes the order,
  // records the Payment, deducts inventory, and flips the table, same as a normal transfer
  // reconciliation. `recordedById` is only set on a manual assignment (a human picked this order);
  // auto-matches have no user to attribute it to.
  private async closeOrderForTransfer(
    organizationId: string,
    order: { id: string; total: Prisma.Decimal | number | string; amountPaid: Prisma.Decimal | number | string; tableId: string | null },
    amount: number,
    transactionReference: string | undefined,
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
    const newAmountPaid = Math.round((Number(order.amountPaid) + amount) * 100) / 100;
    const isFinalPayment = newAmountPaid >= Number(order.total) - 0.01;
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
          paymentMethod: 'MONIEPOINT_TRANSFER',
          paymentDate: new Date(),
          moniepointReference: transactionReference,
          isAutoRecorded: !recordedById,
          notes:
            result.count === 0
              ? 'Received after order was already closed/cancelled — needs manual review'
              : !isFinalPayment
                ? `Partial payment — ₦${newAmountPaid} of ₦${order.total} paid so far`
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

    await this.closeOrderForTransfer(organizationId, order, Number(transfer.amount), transfer.transactionReference ?? undefined, userId);

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

  /**
   * Pushes the order's amount to the restaurant's own physical terminal — the customer then
   * taps/inserts their card on that device. Returns immediately once Moniepoint has queued the
   * transaction (202 Accepted); actual success/failure only arrives later via webhook (see
   * handleWebhookEvent), or — in mock mode — a simulated timer standing in for that webhook.
   */
  async pushOrderPayment(organizationId: string, orderId: string, terminalId: string, amount?: number) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    if (!this.isMockMode && (!organization.moniepointClientId || !organization.moniepointClientSecretEncrypted)) {
      throw new BadRequestException('Moniepoint POS is not set up for this organization');
    }

    // A business account can have several terminals (front counter, bar, …) — the caller picks
    // which physical device this push goes to. Still required in mock mode so the mock flow
    // exercises the same terminal-ownership check real pushes get; mock orgs just need at least
    // one terminal row created via createTerminal like any other org.
    const terminal = await this.prisma.moniepointTerminal.findFirst({ where: { id: terminalId, organizationId, isActive: true } });
    if (!terminal) {
      throw new NotFoundException('Terminal not found');
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
    const terminalSerial = terminal.serial;
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
          // Kobo, not Naira — confirmed from real webhook payloads (e.g. amount:1081000 for a
          // ₦10,810 purchase). We were previously sending pushAmount as-is (e.g. 1410 meaning
          // ₦1,410), which Moniepoint would have read as ₦14.10 — very plausibly why nothing
          // ever visibly happened on the terminal despite clean success responses.
          amount: Math.round(pushAmount * 100),
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
