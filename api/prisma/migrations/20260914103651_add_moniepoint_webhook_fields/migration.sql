-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "moniepoint_business_id" INTEGER,
ADD COLUMN     "moniepoint_webhook_secret_encrypted" TEXT,
ADD COLUMN     "moniepoint_webhook_subscription_id" TEXT;

