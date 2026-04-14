-- CreateEnum
CREATE TYPE "TaxCategory" AS ENUM ('RENT', 'SALARIES', 'UTILITIES', 'MARKETING', 'TRANSPORT', 'PROFESSIONAL_FEES', 'LOAN_INTEREST', 'CAPITAL_ASSETS', 'NON_DEDUCTIBLE', 'UNCATEGORIZED');

-- AlterTable: add tax_category and is_deductible to expenses
ALTER TABLE "expenses"
  ADD COLUMN "tax_category" "TaxCategory" NOT NULL DEFAULT 'UNCATEGORIZED',
  ADD COLUMN "is_deductible" BOOLEAN NOT NULL DEFAULT true;
