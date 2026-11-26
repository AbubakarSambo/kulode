ALTER TABLE "invoice_items" ADD COLUMN "menu_item_id" TEXT;

CREATE INDEX "invoice_items_menu_item_id_idx" ON "invoice_items"("menu_item_id");

ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
