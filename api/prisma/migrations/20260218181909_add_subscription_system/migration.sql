-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO', 'BUSINESS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'ANNUAL');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "billing_period" "BillingPeriod",
ADD COLUMN     "is_grandfathered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paystack_customer_code" TEXT,
ADD COLUMN     "plan_tier" "PlanTier" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "subscription_end_date" TIMESTAMP(3),
ADD COLUMN     "subscription_start_date" TIMESTAMP(3),
ADD COLUMN     "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
ADD COLUMN     "trial_end_date" TIMESTAMP(3),
ADD COLUMN     "trial_start_date" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "subscription_payments" (
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

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_paystack_reference_key" ON "subscription_payments"("paystack_reference");

-- CreateIndex
CREATE INDEX "subscription_payments_organization_id_idx" ON "subscription_payments"("organization_id");

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grandfather existing organizations into PRO plan
UPDATE organizations SET plan_tier = 'PRO', subscription_status = 'ACTIVE', is_grandfathered = true;
