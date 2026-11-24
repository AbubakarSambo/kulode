-- CreateEnum
CREATE TYPE "InvoiceCollectionState" AS ENUM ('SCHEDULED', 'REMINDING', 'PROMISED', 'PAID', 'CLOSED', 'OWNER_ATTENTION');

-- CreateEnum
CREATE TYPE "InvoiceCollectionMode" AS ENUM ('APPROVE', 'AUTO');

-- CreateEnum
CREATE TYPE "InvoiceCollectionReminderStatus" AS ENUM ('PENDING_APPROVAL', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "whatsapp_opt_in_source" TEXT,
ADD COLUMN     "whatsapp_opted_out_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "invoice_collection_policies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "client_id" TEXT,
    "schedule" JSONB NOT NULL,
    "mode" "InvoiceCollectionMode" NOT NULL DEFAULT 'APPROVE',
    "send_hour" INTEGER NOT NULL DEFAULT 9,
    "max_messages" INTEGER NOT NULL DEFAULT 4,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_collection_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_collections" (
    "invoice_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "state" "InvoiceCollectionState" NOT NULL DEFAULT 'SCHEDULED',
    "step_index" INTEGER NOT NULL DEFAULT 0,
    "messages_sent" INTEGER NOT NULL DEFAULT 0,
    "next_action_at" TIMESTAMP(3),
    "promised_date" DATE,
    "last_action_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_collections_pkey" PRIMARY KEY ("invoice_id")
);

-- CreateTable
CREATE TABLE "invoice_collection_reminders" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "step_index" INTEGER NOT NULL,
    "template" TEXT NOT NULL,
    "status" "InvoiceCollectionReminderStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_collection_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_collection_policies_organization_id_idx" ON "invoice_collection_policies"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_collection_policies_organization_id_client_id_key" ON "invoice_collection_policies"("organization_id", "client_id");

-- CreateIndex
CREATE INDEX "invoice_collections_state_next_action_at_idx" ON "invoice_collections"("state", "next_action_at");

-- CreateIndex
CREATE INDEX "invoice_collections_organization_id_idx" ON "invoice_collections"("organization_id");

-- CreateIndex
CREATE INDEX "invoice_collection_reminders_organization_id_status_idx" ON "invoice_collection_reminders"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_collection_reminders_invoice_id_step_index_key" ON "invoice_collection_reminders"("invoice_id", "step_index");

-- AddForeignKey
ALTER TABLE "invoice_collection_policies" ADD CONSTRAINT "invoice_collection_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_collection_policies" ADD CONSTRAINT "invoice_collection_policies_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_collections" ADD CONSTRAINT "invoice_collections_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_collections" ADD CONSTRAINT "invoice_collections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_collection_reminders" ADD CONSTRAINT "invoice_collection_reminders_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_collection_reminders" ADD CONSTRAINT "invoice_collection_reminders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
