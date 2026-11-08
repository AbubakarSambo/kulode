-- Bank-account (Paystack Direct Debit) renewals. All columns are nullable, so existing orgs are unaffected.
CREATE TYPE "DirectDebitStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

ALTER TABLE "organizations"
  ADD COLUMN "direct_debit_status" "DirectDebitStatus",
  ADD COLUMN "direct_debit_authorization_code" TEXT,
  ADD COLUMN "direct_debit_email" TEXT,
  ADD COLUMN "direct_debit_bank_name" TEXT,
  ADD COLUMN "direct_debit_account_last4" TEXT,
  ADD COLUMN "direct_debit_reference" TEXT,
  ADD COLUMN "pending_renewal_reference" TEXT,
  ADD COLUMN "pending_renewal_started_at" TIMESTAMP(3);
