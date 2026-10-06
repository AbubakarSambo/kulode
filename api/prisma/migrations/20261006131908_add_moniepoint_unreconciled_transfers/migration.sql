-- CreateEnum
CREATE TYPE "MoniepointUnreconciledTransferStatus" AS ENUM ('PENDING_REVIEW', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "moniepoint_unreconciled_transfers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "transaction_reference" TEXT,
    "sender_metadata" JSONB,
    "status" "MoniepointUnreconciledTransferStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "match_reason" TEXT NOT NULL,
    "resolved_order_id" TEXT,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moniepoint_unreconciled_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moniepoint_unreconciled_transfers_organization_id_idx" ON "moniepoint_unreconciled_transfers"("organization_id");

-- CreateIndex
CREATE INDEX "moniepoint_unreconciled_transfers_status_idx" ON "moniepoint_unreconciled_transfers"("status");

-- AddForeignKey
ALTER TABLE "moniepoint_unreconciled_transfers" ADD CONSTRAINT "moniepoint_unreconciled_transfers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moniepoint_unreconciled_transfers" ADD CONSTRAINT "moniepoint_unreconciled_transfers_resolved_order_id_fkey" FOREIGN KEY ("resolved_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moniepoint_unreconciled_transfers" ADD CONSTRAINT "moniepoint_unreconciled_transfers_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

