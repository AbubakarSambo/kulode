-- CreateEnum
CREATE TYPE "PaystackSubaccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "is_auto_recorded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "net_amount" DECIMAL(12,2),
ADD COLUMN     "paystack_fees" DECIMAL(12,2),
ADD COLUMN     "paystack_reference" TEXT;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "bank_code" TEXT,
ADD COLUMN     "is_bank_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paystack_subaccount_code" TEXT,
ADD COLUMN     "paystack_subaccount_status" "PaystackSubaccountStatus";

-- CreateIndex
CREATE UNIQUE INDEX "expenses_paystack_reference_key" ON "expenses"("paystack_reference");
