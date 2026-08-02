-- CreateEnum
CREATE TYPE "SheetSyncTab" AS ENUM ('ORDERS', 'PAYMENTS', 'WALLET_TRANSACTIONS');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "google_sheet_id" TEXT;

-- CreateTable
CREATE TABLE "sheet_sync_queue" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "tab" "SheetSyncTab" NOT NULL,
    "row_values" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sheet_sync_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sheet_sync_queue_organization_id_synced_at_idx" ON "sheet_sync_queue"("organization_id", "synced_at");

-- AddForeignKey
ALTER TABLE "sheet_sync_queue" ADD CONSTRAINT "sheet_sync_queue_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
