-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "paystack_authorization_code" TEXT;
ALTER TABLE "organizations" ADD COLUMN "paystack_billing_email" TEXT;
ALTER TABLE "organizations" ADD COLUMN "paystack_card_last4" TEXT;
ALTER TABLE "organizations" ADD COLUMN "paystack_card_type" TEXT;
ALTER TABLE "organizations" ADD COLUMN "auto_renew" BOOLEAN NOT NULL DEFAULT true;
