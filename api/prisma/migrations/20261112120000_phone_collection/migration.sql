-- Phone-number collection (Feature 1): credits for staff who capture customer numbers, collection
-- periods with targets, and the org settings they read.

ALTER TABLE "organizations"
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
  ADD COLUMN "phone_country" TEXT NOT NULL DEFAULT 'NG',
  ADD COLUMN "phone_blocklist" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "customers" ADD COLUMN "created_by" TEXT;

-- Existing customers were saved as free text ("0803…", "+234 803…", "234803…"). Looking a number up
-- compares digits only, so index exactly that expression.
CREATE INDEX "customers_org_phone_digits_idx"
  ON "customers" ("organization_id", (regexp_replace("phone", '[^0-9]', '', 'g')))
  WHERE "phone" IS NOT NULL;

CREATE TYPE "PhoneCreditSource" AS ENUM ('ORDER', 'PAY', 'QUICK_ADD', 'CUSTOMER_FORM');
CREATE TYPE "CollectionPeriodStatus" AS ENUM ('OPEN', 'LOCKED');

CREATE TABLE "phone_credits" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "entered_by" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "source" "PhoneCreditSource" NOT NULL,
  "order_id" TEXT,
  "captured_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "client_request_id" TEXT,
  "revoked_by" TEXT,
  "revoked_at" TIMESTAMP(3),
  "revoke_reason" TEXT,
  CONSTRAINT "phone_credits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "phone_credits_customer_id_key" ON "phone_credits"("customer_id");
CREATE INDEX "phone_credits_organization_id_user_id_captured_at_idx" ON "phone_credits"("organization_id", "user_id", "captured_at");
ALTER TABLE "phone_credits" ADD CONSTRAINT "phone_credits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phone_credits" ADD CONSTRAINT "phone_credits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phone_credits" ADD CONSTRAINT "phone_credits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "collection_periods" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "start_date" VARCHAR(10) NOT NULL,
  "end_date" VARCHAR(10) NOT NULL,
  "roles_in_scope" TEXT[],
  "minimum" INTEGER NOT NULL,
  "threshold" INTEGER NOT NULL,
  "reward_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "deduction_pct" INTEGER NOT NULL DEFAULT 0,
  "coverage_goal_pct" INTEGER NOT NULL DEFAULT 70,
  "status" "CollectionPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "locked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collection_periods_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "collection_periods_organization_id_status_idx" ON "collection_periods"("organization_id", "status");
ALTER TABLE "collection_periods" ADD CONSTRAINT "collection_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "collection_overrides" (
  "id" TEXT NOT NULL,
  "period_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "minimum" INTEGER,
  "threshold" INTEGER,
  "opening_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "collection_overrides_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "collection_overrides_period_id_user_id_key" ON "collection_overrides"("period_id", "user_id");
ALTER TABLE "collection_overrides" ADD CONSTRAINT "collection_overrides_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "collection_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
