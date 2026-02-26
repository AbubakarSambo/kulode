-- Recreate subscription_payments table that was dropped by the inventory migration

CREATE TABLE IF NOT EXISTS "subscription_payments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "billing_period" "BillingPeriod" NOT NULL,
    "plan_tier" "PlanTier" NOT NULL,
    "paystack_reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'success',
    "paid_at" TIMESTAMP(3) NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payments_paystack_reference_key" ON "subscription_payments"("paystack_reference");

CREATE INDEX IF NOT EXISTS "subscription_payments_organization_id_idx" ON "subscription_payments"("organization_id");

ALTER TABLE "subscription_payments" DROP CONSTRAINT IF EXISTS "subscription_payments_organization_id_fkey";
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
