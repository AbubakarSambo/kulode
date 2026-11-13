-- CreateEnum
CREATE TYPE "LoyaltyEnrolSource" AS ENUM ('ORDER', 'PAY', 'QUICK_ADD', 'CUSTOMER_FORM');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "enrol_source" "LoyaltyEnrolSource",
ADD COLUMN     "enrolled_at" TIMESTAMP(3),
ADD COLUMN     "enrolled_by" TEXT,
ADD COLUMN     "is_member" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lifetime_spend" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "message_consent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "loyalty_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loyalty_expiry_days" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "loyalty_start_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "loyalty_reward_rules" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "threshold_amount" DECIMAL(14,2) NOT NULL,
    "repeating" BOOLEAN NOT NULL DEFAULT true,
    "max_per_order" INTEGER,
    "food_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_reward_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_reward_rule_items" (
    "rule_id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,

    CONSTRAINT "loyalty_reward_rule_items_pkey" PRIMARY KEY ("rule_id","menu_item_id")
);

-- CreateIndex
CREATE INDEX "loyalty_reward_rules_organization_id_idx" ON "loyalty_reward_rules"("organization_id");

-- CreateIndex
CREATE INDEX "loyalty_reward_rule_items_menu_item_id_idx" ON "loyalty_reward_rule_items"("menu_item_id");

-- CreateIndex
CREATE INDEX "customers_organization_id_is_member_idx" ON "customers"("organization_id", "is_member");

-- AddForeignKey
ALTER TABLE "loyalty_reward_rules" ADD CONSTRAINT "loyalty_reward_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_reward_rule_items" ADD CONSTRAINT "loyalty_reward_rule_items_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "loyalty_reward_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_reward_rule_items" ADD CONSTRAINT "loyalty_reward_rule_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

