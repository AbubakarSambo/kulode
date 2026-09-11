-- CreateEnum
CREATE TYPE "MoniepointTransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "moniepoint_access_token" TEXT,
ADD COLUMN     "moniepoint_access_token_expires_at" TIMESTAMP(3),
ADD COLUMN     "moniepoint_client_id" TEXT,
ADD COLUMN     "moniepoint_client_secret_encrypted" TEXT,
ADD COLUMN     "moniepoint_terminal_serial" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "moniepoint_reference" TEXT;

-- CreateTable
CREATE TABLE "moniepoint_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "merchant_reference" TEXT NOT NULL,
    "terminal_serial" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "MoniepointTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "failure_reason" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moniepoint_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "moniepoint_transactions_merchant_reference_key" ON "moniepoint_transactions"("merchant_reference");

-- CreateIndex
CREATE INDEX "moniepoint_transactions_organization_id_idx" ON "moniepoint_transactions"("organization_id");

-- CreateIndex
CREATE INDEX "moniepoint_transactions_order_id_idx" ON "moniepoint_transactions"("order_id");

-- AddForeignKey
ALTER TABLE "moniepoint_transactions" ADD CONSTRAINT "moniepoint_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moniepoint_transactions" ADD CONSTRAINT "moniepoint_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

