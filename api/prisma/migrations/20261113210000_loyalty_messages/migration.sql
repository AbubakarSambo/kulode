-- CreateEnum
CREATE TYPE "LoyaltyMessageKind" AS ENUM ('WELCOME', 'REWARD_EARNED');

-- CreateEnum
CREATE TYPE "LoyaltyMessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "loyalty_messages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "kind" "LoyaltyMessageKind" NOT NULL,
    "status" "LoyaltyMessageStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "provider_message_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loyalty_messages_status_next_attempt_at_idx" ON "loyalty_messages"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "loyalty_messages_organization_id_kind_status_idx" ON "loyalty_messages"("organization_id", "kind", "status");

-- CreateIndex
CREATE INDEX "loyalty_messages_customer_id_idx" ON "loyalty_messages"("customer_id");

-- AddForeignKey
ALTER TABLE "loyalty_messages" ADD CONSTRAINT "loyalty_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_messages" ADD CONSTRAINT "loyalty_messages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

