# Changelog

All notable changes to this project are documented here, newest first.

## 2026-07-14

### Added
- **Vendor payouts (Expenses tab)** — customers can now pay a vendor directly from their own bank account via Paystack, without Kulode ever holding the funds (Subaccount + Transaction Split, not a debit-then-transfer pattern). Adding a vendor with verified bank details now provisions a live Paystack subaccount; paying a vendor opens Paystack checkout and auto-records the resulting payment as an Expense once the webhook confirms it.
- **Vendor bank verification** — the "Add Vendor" form now resolves the account name via Paystack before saving, matching the existing organization Paystack-setup flow, instead of accepting free-text bank details.
- **Platform-admin vendor-payout queue** — new "Vendor Payouts" tab in the internal Admin Dashboard listing every vendor subaccount awaiting Paystack's manual first-payout review across all organizations, with a "Mark Active" action. Paystack confirmed there's no API/webhook for this review status, so it's a manual queue by necessity.
- **Ops notification on new vendor subaccount** — an internal email (`PLATFORM_OPS_EMAIL`) now fires whenever a new vendor payout subaccount is created, so staff know to check Paystack's dashboard instead of relying solely on Paystack's own notification.

### Changed
- **Vendors list "Status" column now shows payout readiness** (Payouts Active / Pending Review / Setup Failed / Not Set Up) instead of the `isActive` flag, which had no UI to ever toggle it and wasn't used anywhere else in the app.

### Fixed
- **Vendor payout reconciliation gap** — the payment-callback verification path (`GET /paystack/verify/:reference`, hit when the browser returns from checkout) wasn't routing vendor payouts to the vendor-payout reconciler, unlike the webhook path — it fell through to the invoice reconciler and logged a spurious "no invoice found" error. The webhook path itself was unaffected, but this closes the gap so verification-triggered reconciliation works for vendor payouts too.
- **Grandfathered orgs no longer count as "paying" in Platform Admin metrics** — the Revenue & Billing tab's Plan Distribution "X paying" label and the Overview tab's Trial → Paid Conversion rate were both counting grandfathered organizations (exempt from billing) as active paying customers, since both were computed purely from `subscriptionStatus` with no `isGrandfathered` exclusion. Added a dedicated paying-orgs count/breakdown that excludes them.
- **Vendor payout fee-split bug — vendors were being shortchanged above ₦2,500.** The flat 2% platform-split margin only reliably covered Paystack's real fee below the ₦2,500 threshold where Paystack's flat +₦100 fee component doesn't apply; above it, a live payout confirmed the vendor's share absorbed the shortfall instead of Kulode's account. Replaced the flat-percentage margin with an exact per-transaction `transaction_charge`, computed from the same fee formula already used for invoice collection, so the vendor always receives precisely the requested amount regardless of amount tier.

## 2026-07-11

### Added
- **PNG export for invoices** — invoices can now be downloaded as PNG in addition to PDF, from the invoice detail page, the public share link, and the API directly (`GET /invoices/:id/png`, `GET /invoices/public/:token/png`). (PR #26, #27)

### Changed
- **Invoice PDF rendering rewritten** — replaced the hand-drawn PDFKit renderer with an HTML template rendered through headless Chrome (puppeteer), making layout changes far easier to maintain. (PR #27)

### Fixed
- **CORS on Vercel previews** — the API now allows this project's Vercel preview deployments (`kulode-sd1f-*-abubakar-sambos-projects.vercel.app`) in addition to the static production allow-list, fixing login/API calls from preview branches.

## 2026-07-10

### Added
- **CAC/CAMA compliance fields** — organizations can record their CAC registration (RC) number and a list of directors (with former name / non-Nigerian nationality flags) in Settings. Both now print on invoice PDFs: RC number under the org header, directors listed above the footer, satisfying CAMA 2020 s.304 disclosure requirements.

## 2026-07-08

### Added
- **WhatsApp integration** (PR #24)
  - Outbound payment reminders via the WhatsApp Business API (Meta Cloud API), gated behind per-client opt-in consent.
  - Delivery status tracking (`sent` → `delivered` → `read` → `failed`) via a Meta webhook, with a verify-token check for security.
  - Invoice detail page now shows the latest WhatsApp message's delivery status.

### Fixed
- Marketing site: added `cleanUrls` to Vercel config, dropping `.html` extensions from URLs.

## 2026-07-06 – 2026-07-08

### Added
- **Auto-generated payment links on send** — sending or opening an invoice now auto-creates its Paystack payment link(s) immediately; failures surface as a non-blocking warning instead of failing silently.
- **Fallback payment email** — payment link generation now falls back to the org owner's email when the client has none on file; the invoice-sent email falls back to a "View Invoice" link when no payment URL exists yet.
- **Daily overdue-invoice cron** — a scheduled job (midnight daily) now auto-marks invoices as `OVERDUE`.

### Fixed
- **Payment-link security fix** — link generation was scoped by invoice ID only; now scoped to the caller's organization too, closing a cross-org access gap.
- **Safer cancel/delete rules** — invoices that have received *any* payment can no longer be cancelled or deleted (previously only fully `PAID` invoices were protected), preventing orphaned payment records.

## 2026-07-02 – 2026-07-03

### Added
- **Segmented progress stepper** — replaced the onboarding circle-and-line stepper with a minimalist pill-bar layout; completed steps are color-coded and clickable to jump back.
- **Onboarding resume & polish** — refined the onboarding checklist and welcome stepper, added an offline-publication confirmation dialog, and fixed local payment-link URL resolution during onboarding.
- **WhatsApp contact-picker fallback** — when a client has no saved phone number, WhatsApp share now opens the native contact picker instead of showing a "number not available" error.

### Changed
- **Billing line-item spacing** — increased padding/gaps across billing item cards for a more scannable layout.
- **PDF footer branding** — iterated twice in one day, settling on "Built with Tari1: Work smarter, stay organized. · tarione.com"; logo centering fixed via PDFKit's `fit`+`align` (previously pinned left due to a PDFKit quirk). Report PDFs got the same update.

### Fixed
- **Session cache cleared on logout** — fixed session bleed where a previous user's outstanding balances or onboarding progress could flash on screen after a new user logged in.

## 2026-07-01

### Removed
- **Rebrand banner retired early** — removed the dismissible "Tari → Tari1" announcement banner (client app + marketing site), originally scheduled to run through 2026-07-12.

### Changed
- Updated logo/version references across the marketing pages and footer.

### Fixed
- **Marketing trailing-slash fix** — `astro.config.mjs` now sets `trailingSlash: 'never'` and `build.format: 'file'`, so marketing URLs no longer inconsistently redirect on/off a trailing slash.
