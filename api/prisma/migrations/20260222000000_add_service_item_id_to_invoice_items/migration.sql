-- AlterTable
ALTER TABLE "invoice_items" ADD COLUMN "service_item_id" TEXT;

-- CreateIndex
CREATE INDEX "invoice_items_service_item_id_idx" ON "invoice_items"("service_item_id");

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_service_item_id_fkey"
  FOREIGN KEY ("service_item_id") REFERENCES "service_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
