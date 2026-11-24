-- CreateTable
CREATE TABLE "inbound_whatsapp_messages" (
    "id" TEXT NOT NULL,
    "provider_message_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "invoice_id" TEXT,
    "client_id" TEXT,
    "from_phone" TEXT NOT NULL,
    "message_type" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "intent" TEXT,
    "promised_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inbound_whatsapp_messages_provider_message_id_key" ON "inbound_whatsapp_messages"("provider_message_id");

-- CreateIndex
CREATE INDEX "inbound_whatsapp_messages_invoice_id_created_at_idx" ON "inbound_whatsapp_messages"("invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "inbound_whatsapp_messages_organization_id_idx" ON "inbound_whatsapp_messages"("organization_id");
