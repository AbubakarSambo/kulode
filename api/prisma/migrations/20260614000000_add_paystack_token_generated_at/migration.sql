-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "paystack_token_generated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payment_installments" ADD COLUMN "paystack_token_generated_at" TIMESTAMP(3);
