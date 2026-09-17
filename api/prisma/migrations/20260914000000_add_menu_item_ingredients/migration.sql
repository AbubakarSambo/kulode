-- Recipe lines for menu items: how much of an inventory item one unit of a menu item consumes.
-- Deducted per-line on OrderItem SERVED (see InventoryService.deductRecipeForOrderItem), separate
-- from the legacy MenuItem.inventoryItemId 1:1 link deducted at order close.
CREATE TABLE "menu_item_ingredients" (
    "id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "quantity_per_unit" DECIMAL(10,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_ingredients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "menu_item_ingredients_menu_item_id_inventory_item_id_key" ON "menu_item_ingredients"("menu_item_id", "inventory_item_id");

CREATE INDEX "menu_item_ingredients_menu_item_id_idx" ON "menu_item_ingredients"("menu_item_id");

CREATE INDEX "menu_item_ingredients_inventory_item_id_idx" ON "menu_item_ingredients"("inventory_item_id");

ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
