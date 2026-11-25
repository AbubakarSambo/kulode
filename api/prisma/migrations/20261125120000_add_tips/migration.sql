-- CreateEnum
CREATE TYPE "TipStatus" AS ENUM ('ACTIVE', 'VOIDED');
CREATE TYPE "TipLedgerEntryType" AS ENUM ('EARNED', 'VOIDED', 'PAYOUT');
CREATE TYPE "TipPayoutSource" AS ENUM ('CASH_DRAWER', 'BANK');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "tips_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN "tip_presets" INTEGER[] DEFAULT ARRAY[1000, 3000, 5000]::INTEGER[];

-- CreateTable
CREATE TABLE "tips" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "TipStatus" NOT NULL DEFAULT 'ACTIVE',
    "recorded_by" TEXT NOT NULL,
    "voided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tips_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tip_ledger_entries" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "waiter_id" TEXT,
    "tip_id" TEXT,
    "type" "TipLedgerEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paid_from" "TipPayoutSource",
    "approved_by" TEXT,
    "recorded_by" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tip_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tips_organization_id_idx" ON "tips"("organization_id");
CREATE INDEX "tips_order_id_idx" ON "tips"("order_id");
CREATE INDEX "tip_ledger_entries_organization_id_waiter_id_idx" ON "tip_ledger_entries"("organization_id", "waiter_id");
CREATE INDEX "tip_ledger_entries_tip_id_idx" ON "tip_ledger_entries"("tip_id");

-- AddForeignKey
ALTER TABLE "tips" ADD CONSTRAINT "tips_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tips" ADD CONSTRAINT "tips_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tip_ledger_entries" ADD CONSTRAINT "tip_ledger_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tip_ledger_entries" ADD CONSTRAINT "tip_ledger_entries_waiter_id_fkey" FOREIGN KEY ("waiter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tip_ledger_entries" ADD CONSTRAINT "tip_ledger_entries_tip_id_fkey" FOREIGN KEY ("tip_id") REFERENCES "tips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
