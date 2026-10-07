-- CreateEnum
CREATE TYPE "UnreconciledTransferResolutionType" AS ENUM ('ORDER', 'WALLET_TOPUP', 'OTHER');

-- AlterTable
ALTER TABLE "moniepoint_unreconciled_transfers"
  ADD COLUMN "resolution_type" "UnreconciledTransferResolutionType",
  ADD COLUMN "resolved_customer_id" TEXT;

-- AddForeignKey
ALTER TABLE "moniepoint_unreconciled_transfers" ADD CONSTRAINT "moniepoint_unreconciled_transfers_resolved_customer_id_fkey" FOREIGN KEY ("resolved_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
