-- CreateTable
CREATE TABLE "menu_item_categories" (
    "menu_item_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_item_categories_pkey" PRIMARY KEY ("menu_item_id","category_id")
);

-- CreateIndex
CREATE INDEX "menu_item_categories_category_id_idx" ON "menu_item_categories"("category_id");

-- AddForeignKey
ALTER TABLE "menu_item_categories" ADD CONSTRAINT "menu_item_categories_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_categories" ADD CONSTRAINT "menu_item_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing single-category assignments into the join table
INSERT INTO "menu_item_categories" ("menu_item_id", "category_id")
SELECT "id", "category_id" FROM "menu_items" WHERE "category_id" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "menu_items" DROP CONSTRAINT "menu_items_category_id_fkey";

-- DropIndex
DROP INDEX "menu_items_category_id_idx";

-- AlterTable
ALTER TABLE "menu_items" DROP COLUMN "category_id";
