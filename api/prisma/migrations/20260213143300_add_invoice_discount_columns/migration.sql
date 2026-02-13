-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
