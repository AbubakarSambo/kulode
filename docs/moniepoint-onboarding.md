# Onboarding a new organization onto Moniepoint POS

## 0. Prerequisites

**Platform-level (once per environment, not per org)** — env vars loaded via `moniepointConfig` (`api/src/config/configuration.ts:48-67`), listed in `api/.env.example:25-36`:

| Var | Purpose |
|---|---|
| `MONIEPOINT_POS_BASE_URL` | legacy/unused OAuth host (default `https://channel.moniepoint.com`) |
| `MONIEPOINT_POS_API_BASE_URL` | real API host for introspect/transactions/webhook-subscriptions (default `https://api.pos.moniepoint.com`) |
| `MONIEPOINT_ENCRYPTION_KEY` | encrypts `clientSecret` / `webhookSecret` at rest |
| `MONIEPOINT_MOCK_MODE` | `"true"` simulates pushes without calling Moniepoint (used locally) |
| `MONIEPOINT_WEBHOOK_BASE_URL` | this environment's own public URL; used to build the `endpointUrl` registered with Moniepoint |

**Merchant-side (before touching Tarione) — IMPORTANT, read carefully:**

Moniepoint's dashboard has **two different screens that both call their output an "API Key"**, but only one of them is actually valid as the Bearer token our app needs. Getting this wrong produces a `401 Invalid key provided.` error from Moniepoint that looks identical to a bad/stale credential, and can burn hours of debugging (ask us how we know).

- ❌ **Settings → POS Terminal Configuration → Activate ERP Integration → POS app developer → Select your Integration** — this generates a `clientId` + a short random string labeled "Your API Key" (e.g. `NF(ifGYyZVW3OthB^!5E`). **This string does NOT work as the Bearer token for `api.pos.moniepoint.com` — Moniepoint rejects it with "Invalid key provided." even when freshly generated.**
- ✅ **Settings → POS Terminal Configuration → Activate ERP Integration → POS APPS Developer → API Keys → Create New API Key** — enter a name + duration. This generates the **real** credential, in the format `mptp_<32-hex>_<6-hex>` (e.g. `mptp_83c602bd416e4521900d4d60c448b0b8_d86987`). **This is the value that goes in the app's `clientSecret` field.**

Confirmed by directly calling `GET https://api.pos.moniepoint.com/v1/introspect` with each: the `mptp_...` key returns a real `200` with `scopes`, the linked `businesses` list, and `environment`; the short ERP-integration-screen string returns `401 Invalid key provided.` every time.

Also note: `clientId` (the `api-client-...` value from the ERP integration screen) does not appear to be used anywhere in the actual Moniepoint API calls (introspect, webhook-subscriptions, transactions all authenticate with just the Bearer token) — it may be effectively vestigial for our purposes, but we still store and require it since the setup form/DTO expects it.

You'll also need the physical terminal's **serial number (SN)** — alphanumeric, found on the terminal itself under its device/settings menu (ignore IMEI1/IMEI2, those are cellular modem identifiers, not the terminal serial).

## 1. Enter credentials

Staff goes to **Settings → Moniepoint** in the app and enters:
- `clientId` (required) — the `api-client-...` value from the ERP Integration screen (see caveat above — likely unused for auth, but still required by the form)
- `clientSecret` (required) — **the `mptp_...` API Key from POS APPS Developer → API Keys**, NOT the short string from the "Client Credentials Generated" screen (see above)
- `terminalSerial` (required) — the terminal's SN
- `businessId` (optional — usually auto-detected in step 2; if entering manually, it's purely numeric digits, e.g. `1120783` — never a phone number or any other format)

Validated client-side by Zod (`client/src/pages/settings/MoniepointPage.tsx:13-23`).

→ `POST /organizations/setup-moniepoint` (`moniepoint.controller.ts:27-37`, role ADMIN/SUPER_ADMIN) → `MoniepointService.setupCredentials` (`moniepoint.service.ts:95-114`).

No external Moniepoint call here — just persists on `Organization`: `moniepointClientId`, `moniepointClientSecretEncrypted` (encrypted), `moniepointTerminalSerial`, `moniepointBusinessId`, and clears any cached `moniepointAccessToken` / `moniepointAccessTokenExpiresAt`.

## 2. Subscribe the webhook

Once `status.isSetup` is true, staff clicks **Subscribe**.

→ `POST /organizations/moniepoint-subscribe-webhook` (`moniepoint.controller.ts:69-76`, ADMIN/SUPER_ADMIN) → `subscribeToWebhook` (`moniepoint.service.ts:165-229`):

1. If `businessId` wasn't supplied in step 1, calls `GET /v1/introspect` on `posApiBaseUrl` (Bearer: the `mptp_...` API Key) to auto-detect it (`service.ts:188-201, 240-268`). Fails with a 400 telling staff to re-enter `businessId` manually if introspect is ambiguous/fails (e.g. the key is linked to multiple businesses).
2. Calls `POST /v1/webhook-subscriptions` on `posApiBaseUrl` with:
   - `endpointUrl` = `MONIEPOINT_WEBHOOK_BASE_URL` + `/api/v1/webhooks/moniepoint`
   - `eventTypes: ["V1_POS_PURCHASE_TRANSACTION"]`
   - `businessId`
3. Stores the returned subscription id in `moniepointWebhookSubscriptionId`.

**If this fails with `401 Invalid key provided.`**, the #1 cause is the wrong "API Key" was used in step 1 — go back and confirm the `clientSecret` value is the `mptp_...` one, not the ERP-integration-screen one.

## 3. Save the webhook secret

Moniepoint shows the webhook secret **once**, in the subscription's menu in their dashboard — it's not returned by the create API (`MoniepointPage.tsx:197-199`). Staff copies it and pastes it into the app.

→ `POST /organizations/moniepoint-webhook-secret` (`moniepoint.controller.ts:78-88`, ADMIN/SUPER_ADMIN, body validated by `SetWebhookSecretDto`) → `setWebhookSecret` (`service.ts:274-286`) stores it encrypted as `moniepointWebhookSecretEncrypted`. No external call.

## 4. Confirm status

`GET /organizations/moniepoint-status` (`moniepoint.controller.ts:39-45` → `service.ts:116-139`) reports:
- `isSetup` (clientId + terminalSerial present)
- `terminalSerial`
- `isWebhookSubscribed`
- `hasWebhookSecret`

The settings UI gates each step above on this. Once all four are true/set, onboarding is complete.

## 5. Day-to-day use

- `POST /orders/:id/moniepoint-push` (`moniepoint.controller.ts:56-67`, roles STAFF/ACCOUNTANT/CASHIER/ADMIN/SUPER_ADMIN) pushes a card charge to the terminal via `POST /v1/transactions` on `posApiBaseUrl` (amount in kobo, `paymentMethod: CARD_PURCHASE`).
- Completion arrives asynchronously via `POST /webhooks/moniepoint` (public endpoint, `controller.ts:107-120`), which finalizes the pushed transaction's status and also does amount-based reconciliation for raw bank transfers that weren't pushed by the app.

## 6. Disconnect

`DELETE /organizations/moniepoint` (`moniepoint.controller.ts:47-54`, ADMIN/SUPER_ADMIN) nulls out all Moniepoint fields on the `Organization` (`service.ts:141-157`).

## Known gaps — fix before relying on this in production

1. **Webhook signature verification is implemented but not enforced.** A mismatch is only logged, never rejected (`verifyWebhookSignature`, `service.ts:297-301`; see the `TODO(security)` at `controller.ts:101-106` and the `SECURITY GAP` note at `service.ts:605-615`). Anyone who discovers the webhook URL could currently forge a "payment succeeded" event for any `merchantReference` they can guess or observe.
2. **Webhook transaction-status mapping was fixed 2026-10-05** (`fix/moniepoint-webhook-status-mapping`) — it previously only recognized `transactionStatus === 'APPROVED'` as success, but Moniepoint actually sends `'SUCCESSFUL'`, so real successful payments were being recorded as FAILED. Now also accepts `'SUCCESSFUL'` and `responseCode === '00'`.
3. **Setup credentials weren't trimmed of whitespace before storage** — fixed 2026-10-05 (`fix/moniepoint-credentials-trim-whitespace`). Copy-pasting a key with a trailing space/newline used to silently corrupt the stored credential.
4. **The "which API Key" confusion documented above** is the single biggest time-sink in onboarding so far — consider updating the in-app field label/help text for `clientSecret` to explicitly say "from POS APPS Developer → API Keys, not the ERP Integration screen" so this isn't rediscovered by trial and error every time.
