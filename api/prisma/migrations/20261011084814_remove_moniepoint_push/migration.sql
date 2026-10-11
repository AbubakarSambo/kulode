-- CreateEnum
CREATE TYPE "MoniepointUnreconciledTransferSource" AS ENUM ('TRANSFER', 'CARD');

-- DropForeignKey
ALTER TABLE "moniepoint_terminals" DROP CONSTRAINT "moniepoint_terminals_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "moniepoint_transactions" DROP CONSTRAINT "moniepoint_transactions_order_id_fkey";

-- DropForeignKey
ALTER TABLE "moniepoint_transactions" DROP CONSTRAINT "moniepoint_transactions_organization_id_fkey";

-- AlterTable
ALTER TABLE "moniepoint_unreconciled_transfers" ADD COLUMN     "source" "MoniepointUnreconciledTransferSource" NOT NULL DEFAULT 'TRANSFER';

-- DropTable
DROP TABLE "moniepoint_terminals";

-- DropTable
DROP TABLE "moniepoint_transactions";

-- DropEnum
DROP TYPE "MoniepointTransactionStatus";

