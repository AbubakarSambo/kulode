-- CreateEnum
CREATE TYPE "LoyaltyLedgerType" AS ENUM ('SPEND', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "LoyaltyRewardStatus" AS ENUM ('AVAILABLE', 'REDEEMED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "loyalty_ledger" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "entry_type" "LoyaltyLedgerType" NOT NULL,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_rewards" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "status" "LoyaltyRewardStatus" NOT NULL DEFAULT 'AVAILABLE',
    "earned_order_id" TEXT,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "redeemed_order_id" TEXT,
    "redeemed_menu_item_id" TEXT,
    "redeemed_by" TEXT,
    "redeemed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loyalty_ledger_organization_id_customer_id_created_at_idx" ON "loyalty_ledger"("organization_id", "customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_ledger_order_id_customer_id_entry_type_key" ON "loyalty_ledger"("order_id", "customer_id", "entry_type");

-- CreateIndex
CREATE INDEX "loyalty_rewards_organization_id_customer_id_status_idx" ON "loyalty_rewards"("organization_id", "customer_id", "status");

-- CreateIndex
CREATE INDEX "loyalty_rewards_status_expires_at_idx" ON "loyalty_rewards"("status", "expires_at");

-- CreateIndex
CREATE INDEX "loyalty_rewards_earned_order_id_idx" ON "loyalty_rewards"("earned_order_id");

-- CreateIndex
CREATE INDEX "loyalty_rewards_redeemed_order_id_idx" ON "loyalty_rewards"("redeemed_order_id");

-- AddForeignKey
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "loyalty_reward_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

