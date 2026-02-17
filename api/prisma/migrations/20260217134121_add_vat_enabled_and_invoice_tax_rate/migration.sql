-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "vat_enabled" BOOLEAN NOT NULL DEFAULT false;
