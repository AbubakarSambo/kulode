-- Add a point-in-time name snapshot to order_items so order history/receipts still show
-- what was ordered even after the referenced menu item is hard-deleted.
ALTER TABLE "order_items" ADD COLUMN "item_name" TEXT;

UPDATE "order_items" oi
SET "item_name" = mi."name"
FROM "menu_items" mi
WHERE mi."id" = oi."menu_item_id";

-- Fallback for any order_items whose menu item is already gone (shouldn't happen pre-migration,
-- since the FK was RESTRICT, but keeps the NOT NULL below safe either way).
UPDATE "order_items" SET "item_name" = 'Unknown item' WHERE "item_name" IS NULL;

ALTER TABLE "order_items" ALTER COLUMN "item_name" SET NOT NULL;

-- Allow menu items to be hard-deleted even once they have order history: drop the RESTRICT FK,
-- make menu_item_id nullable, and recreate it with ON DELETE SET NULL.
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_menu_item_id_fkey";

ALTER TABLE "order_items" ALTER COLUMN "menu_item_id" DROP NOT NULL;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_fkey"
  FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
