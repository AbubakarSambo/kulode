# Onboarding a new organization onto Moniepoint POS

## 0. Prerequisites

**Platform-level (once per environment, not per org)** — env vars loaded via `moniepointConfig` (`api/src/config/configuration.ts:48-67`), listed in `api/.env.example:25-36`:

| Var | Purpose |
|---|---|
| `MONIEPOINT_POS_BASE_URL` | legacy/unused OAuth host (default `https://channel.moniepoint.com`) |
| `MONIEPOINT_POS_API_BASE_URL` | real API host for introspect/webhook-subscriptions (default `https://api.pos.moniepoint.com`) |
| `MONIEPOINT_ENCRYPTION_KEY` | encrypts `clientSecret` / `webhookSecret` at rest |
| `MONIEPOINT_WEBHOOK_BASE_URL` | this environment's own public URL; used to build the `endpointUrl` registered with Moniepoint |

**Merchant-side (before touching Tarione) — IMPORTANT, read carefully:**

Moniepoint's dashboard has **two different screens that both call their output an "API Key"**, but only one of them is actually valid as the Bearer token our app needs. Getting this wrong produces a `401 Invalid key provided.` error from Moniepoint that looks identical to a bad/stale credential, and can burn hours of debugging (ask us how we know).

- ❌ **Settings → POS Terminal Configuration → Activate ERP Integration → POS app developer → Select your Integration** — this generates a `clientId` + a short random string labeled "Your API Key" (e.g. `NF(ifGYyZVW3OthB^!5E`). **This string does NOT work as the Bearer token for `api.pos.moniepoint.com` — Moniepoint rejects it with "Invalid key provided." even when freshly generated.**
- ✅ **Settings → POS Terminal Configuration → Activate ERP Integration → POS APPS Developer → API Keys → Create New API Key** — enter a name + duration. This generates the **real** credential, in the format `mptp_<32-hex>_<6-hex>` (e.g. `mptp_83c602bd416e4521900d4d60c448b0b8_d86987`). **This is the value that goes in the app's `clientSecret` field.**

Confirmed by directly calling `GET https://api.pos.moniepoint.com/v1/introspect` with each: the `mptp_...` key returns a real `200` with `scopes`, the linked `businesses` list, and `environment`; the short ERP-integration-screen string returns `401 Invalid key provided.` every time.

Also note: `clientId` (the `api-client-...` value from the ERP integration screen) does not appear to be used anywhere in the actual Moniepoint API calls (introspect, webhook-subscriptions all authenticate with just the Bearer token) — it may be effectively vestigial for our purposes, but we still store and require it since the setup form/DTO expects it.

## 1. Enter credentials

Staff goes to **Settings → Moniepoint** in the app and enters:
- `clientId` (required) — the `api-client-...` value from the ERP Integration screen (see caveat above — likely unused for auth, but still required by the form)
- `clientSecret` (required) — **the `mptp_...` API Key from POS APPS Developer → API Keys**, NOT the short string from the "Client Credentials Generated" screen (see above)
- `businessId` (optional — usually auto-detected in step 2; if entering manually, it's purely numeric digits, e.g. `1120783` — never a phone number or any other format)

Validated client-side by Zod (`client/src/pages/settings/MoniepointPage.tsx`).

→ `POST /organizations/setup-moniepoint` (`moniepoint.controller.ts`, role ADMIN/SUPER_ADMIN) → `MoniepointService.setupCredentials` (`moniepoint.service.ts`).

No external Moniepoint call here — just persists on `Organization`: `moniepointClientId`, `moniepointClientSecretEncrypted` (encrypted), `moniepointBusinessId`, and clears any cached `moniepointAccessToken` / `moniepointAccessTokenExpiresAt`.

## 2. Subscribe the webhook

Once `status.isSetup` is true, staff clicks **Subscribe**.

→ `POST /organizations/moniepoint-subscribe-webhook` (`moniepoint.controller.ts`, ADMIN/SUPER_ADMIN) → `subscribeToWebhook` (`moniepoint.service.ts`):

1. If `businessId` wasn't supplied in step 1, calls `GET /v1/introspect` on `posApiBaseUrl` (Bearer: the `mptp_...` API Key) to auto-detect it. Fails with a 400 telling staff to re-enter `businessId` manually if introspect is ambiguous/fails (e.g. the key is linked to multiple businesses).
2. Calls `POST /v1/webhook-subscriptions` on `posApiBaseUrl` with:
   - `endpointUrl` = `MONIEPOINT_WEBHOOK_BASE_URL` + `/api/v1/webhooks/moniepoint`
   - `eventTypes: [WEBHOOK_EVENT_TYPE, ...TRANSFER_WEBHOOK_EVENT_TYPES]` — `['V1_POS_PURCHASE_TRANSACTION', 'V1_TRANSFER_TRANSACTION', 'V1_POS_TRANSFER_TRANSACTION']` (`moniepoint.service.ts`). Purchase events are required now too, since card payments reconcile the same way transfers do — see step 5.
   - `businessId`
3. Stores the returned subscription id in `moniepointWebhookSubscriptionId`.

**If this fails with `401 Invalid key provided.`**, the #1 cause is the wrong "API Key" was used in step 1 — go back and confirm the `clientSecret` value is the `mptp_...` one, not the ERP-integration-screen one.

**Critical gotcha found 2026-10-06 — getting the event types wrong silently drops real money events, with zero error anywhere:** this code originally only subscribed to `V1_POS_PURCHASE_TRANSACTION`. That means **bank transfers straight into the merchant's Moniepoint account were never delivered to us at all** — not a bug in the reconciliation logic, not a Moniepoint outage, just never asked for. There is no error, no failed webhook, nothing in logs — the transfer just silently never generates a Tarione event, indefinitely, until the subscription is fixed.

Confirmed against real deliveries: a customer transferring into a merchant's account arrives as `eventType: "V1_POS_TRANSFER_TRANSACTION"` (payload has `transactionType: "POS_TRANSFER"`, `transactionStatus: "APPROVED"`, `responseCode: "00"`, and a `metaData` JSON string containing `customerName`/`customerAccountNumber`/`customerBank`/`narration` — e.g. `"MOB: To MONIEPOINT MICROFINANCE BANK|ALMOND CAFE LTD - FROM SAMBO ABUBAKAR"`). The unprefixed `V1_TRANSFER_TRANSACTION` *looks* like the obvious match by name but has never actually been observed firing — it's kept subscribed anyway since it's harmless to over-subscribe (`processIncomingWebhook` no-ops gracefully on a shape it doesn't recognize).

**If an already-onboarded org's transfers or card payments aren't showing up in `/pos/payments` at all** (not even as an unmatched-reconciliation log warning), check its live subscription's `eventTypes` directly rather than assuming the app code — a subscription created/modified outside the current code path (manually, or by an older code version) can be missing an event type even if the org otherwise looks "fully set up":
```bash
curl -s "https://api.pos.moniepoint.com/v1/webhook-subscriptions" \
  -H "Authorization: Bearer <mptp_... API Key>" \
  -H "POS_BUSINESS_ID: <businessId>"
```
If it's missing, fix it immediately without a redeploy via `PUT /v1/webhook-subscriptions/{subscriptionId}` (requires `status` plus the full desired `endpointUrl`/`eventTypes` — Moniepoint's API rejects the PUT with `"Endpoint URL is required"` if you omit it, even though their own OpenAPI spec doesn't mark it required):
```bash
curl -X PUT "https://api.pos.moniepoint.com/v1/webhook-subscriptions/<subscriptionId>" \
  -H "Authorization: Bearer <mptp_... API Key>" \
  -H "Content-Type: application/json" \
  -d '{"status":"ACTIVE","endpointUrl":"https://api.tarione.com/api/v1/webhooks/moniepoint","eventTypes":["V1_POS_PURCHASE_TRANSACTION","V1_TRANSFER_TRANSACTION","V1_POS_TRANSFER_TRANSACTION", ...whatever else it already had]}'
```
The full canonical event-type enum (confirmed from `GET https://api.pos.moniepoint.com/v3/api-docs`, their live OpenAPI spec — a much more reliable source than the Confluence prose docs, which are frequently incomplete/stale): `V1_POS_TRANSACTION`, `V1_POS_WITHDRAWAL_TRANSACTION`, `V1_POS_PURCHASE_TRANSACTION`, `V1_POS_CARD_TRANSFER_TRANSACTION`, `V1_POS_BILL_PAYMENT_TRANSACTION`, `V1_POS_TRANSFER_TRANSACTION`, `V1_TRANSFER_TRANSACTION`, `V1_POS_COLLECTION_TRANSACTION`, `V1_POS_PAY_CODE_TRANSACTION`, `V1_POS_AIRTIME_TRANSACTION`, `V1_POS_BOOM_TRANSACTION`, `V1_POS_DATA_PURCHASE`.

## 3. Save the webhook secret

Moniepoint shows the webhook secret **once**, in the subscription's menu in their dashboard — it's not returned by the create API. Staff copies it and pastes it into the app.

→ `POST /organizations/moniepoint-webhook-secret` (`moniepoint.controller.ts`, ADMIN/SUPER_ADMIN, body validated by `SetWebhookSecretDto`) → `setWebhookSecret` (`moniepoint.service.ts`) stores it encrypted as `moniepointWebhookSecretEncrypted`. No external call.

## 4. Confirm status

`GET /organizations/moniepoint-status` (`moniepoint.controller.ts` → `moniepoint.service.ts`) reports:
- `isSetup` (clientId present)
- `isWebhookSubscribed`
- `hasWebhookSecret`

The settings UI gates each step above on this. Once all three are true, onboarding is complete — there's no terminal to register. Staff just processes card payments on the restaurant's existing Moniepoint terminal as normal (no "push" step in Tarione), and Tarione reconciles both card swipes and bank transfers automatically.

## 5. Day-to-day use

**Both card swipes on the restaurant's terminal and bank transfers into its account reconcile automatically by amount**, via `attemptAmountReconciliation` (`moniepoint.service.ts`) — there is no "push" step; staff never select an order or a terminal in Tarione for a card payment, they just process it on the physical device like normal and Tarione picks it up from the webhook:
- The webhook is classified by `eventType`/`transactionType`: `V1_POS_PURCHASE_TRANSACTION`-shaped events are treated as a card payment, `V1_TRANSFER_TRANSACTION`/`V1_POS_TRANSFER_TRANSACTION` as a transfer.
- Requires **exactly one** open order within `AMOUNT_MATCH_TOLERANCE_KOBO` (±₦50) of the transaction amount to auto-confirm — 0 or 2+ matches logs a warning and leaves it for manual reconciliation rather than guessing.
- **This is still amount-based, which is inherently risky with real money** — on 2026-10-06 a ₦1,000 transfer auto-matched to the wrong order (an unrelated ₦1,000 "Water" order that happened to be open at the time, while the transfer was actually meant for something else). The tolerance-band design correctly refuses to guess when there's genuine ambiguity (2+ candidates), but it can't tell "exactly one open order happens to owe this amount" apart from "this transaction is actually for this order" — those look identical to the matching logic. Real sender identity (`customerName`/`customerAccountNumber`/`customerBank`/`narration`) is present on a transfer webhook's `metaData` field (stored on unmatched rows, see below) but not yet used for matching, and isn't present at all on a card event — narration-based matching (first pass, before falling back to amount) would meaningfully reduce this risk for transfers and is worth building before leaning on this harder. Card volume being generally higher-frequency than transfers makes ambiguous matches more likely there in practice.
- Successfully reconciled payments land as a `Payment` with `paymentMethod: 'MONIEPOINT_POS'` (card) or `'MONIEPOINT_TRANSFER'`, `isAutoRecorded: true` — visible at **`/pos/payments`** (see below).
- A transaction with 0 or 2+ candidate matches is persisted as a `MoniepointUnreconciledTransfer` row (`status: PENDING_REVIEW`, `source: 'CARD' | 'TRANSFER'`) — see below for where to act on it.

**`/pos/payments`** (`client/src/pages/pos/PosPaymentsPage.tsx`, route gated ADMIN/SUPER_ADMIN) — a dedicated list of order-linked payments, separate from the invoice-oriented `/payments` page (mixing the two produced dead invoice links for order-linked rows). Shows order/table, method (with an "auto" badge for webhook-recorded ones), Moniepoint reference, notes (including a variance note when a payment reconciled within tolerance rather than exactly), recorded-by, date, amount. Backed by `GET /payments/pos` (`payments.controller.ts`, same role gate) — a plain-string `paymentMethod` filter is exact-match (case-sensitive), surfaced in the UI as a dropdown rather than free text to avoid that trap.

**`/pos/unreconciled-transfers`** (`client/src/pages/pos/UnreconciledTransfersPage.tsx`, route gated ADMIN/SUPER_ADMIN) — the manual-reconciliation screen for anything `attemptAmountReconciliation` couldn't confidently match, card or transfer (badged by `source`). Lists each `PENDING_REVIEW` row (amount, why it didn't match, sender name/bank/narration when present on a transfer, received time) with actions:
- **Apply to Order** → `POST /moniepoint-unreconciled-transfers/:id/assign { orderId }` (`moniepoint.service.ts` → `assignUnreconciledTransfer`) — closes the picked order via the same `closeOrderForAutoMatch` helper the auto-match path uses (Payment created with `recordedById` set and `isAutoRecorded: false`, inventory deducted, table flipped), then marks the row `RESOLVED`.
- **Wallet Top-up** → `POST /moniepoint-unreconciled-transfers/:id/resolve-wallet { customerId }` — credits a customer's wallet instead, for a transaction that wasn't for an order.
- **Ignore** → `POST /moniepoint-unreconciled-transfers/:id/ignore { notes? }` — marks it `IGNORED` with an optional note, for a transaction that's genuinely unrelated to any order.

Model: `MoniepointUnreconciledTransfer` (`schema.prisma`) — `source` (`TRANSFER` | `CARD`), `amount`, `transactionReference`, `senderMetadata` (Json, the parsed webhook `metaData` when present), `matchReason`, `status`, plus `resolvedOrderId`/`resolvedById`/`resolvedAt`/`resolutionNotes` once acted on.

## 6. Disconnect

`DELETE /organizations/moniepoint` (`moniepoint.controller.ts`, ADMIN/SUPER_ADMIN) nulls out all Moniepoint fields on the `Organization` (`moniepoint.service.ts`).

## Known gaps — fix before relying on this in production

1. **Webhook signature verification is implemented but not enforced.** A mismatch is only logged, never rejected (`verifyWebhookSignature`, `moniepoint.service.ts`; see the `TODO(security)` on the controller). Anyone who discovers the webhook URL could currently forge a "payment succeeded" event. The signed-string format (`${webhookId}.${timestamp}.${rawBody}`) is still an educated guess, not confirmed against docs — header *names* (`moniepoint-webhook-id`/`-timestamp`/`-signature`) are confirmed correct, just not the signing algorithm/string construction.
2. **Webhook transaction-status mapping accepts `'APPROVED'`, `'SUCCESSFUL'`, or `responseCode === '00'`** as success — real deliveries have been observed using more than one of these, so all three are treated as success rather than assuming just one.
3. **The "which API Key" confusion documented above** is the single biggest time-sink in onboarding so far — consider updating the in-app field label/help text for `clientSecret` to explicitly say "from POS APPS Developer → API Keys, not the ERP Integration screen" so this isn't rediscovered by trial and error every time.
4. **Amount-based reconciliation can misattribute a real payment to the wrong order** (confirmed happened once with a transfer, 2026-10-06) — exact/tolerance amount-matching is fundamentally unable to distinguish "this transaction is for this order" from "this order coincidentally owes the same amount." The manual-reconciliation UI (`/pos/unreconciled-transfers`) means no-match/ambiguous cases at least have a durable record and a place to act on them, and a wrong auto-match can be manually fixed (reopen the order, reassign the payment) — but there's still no built-in "undo" button for a bad auto-match, and narration-based matching (using the real `customerName`/`narration` data confirmed present on a transfer webhook payload, captured on `MoniepointUnreconciledTransfer.senderMetadata`) would reduce — not eliminate — the risk of a wrong auto-match happening in the first place. Worth building before this is relied on for real volume, especially now that card payments (typically higher-frequency than transfers) go through the same amount-matching path.
