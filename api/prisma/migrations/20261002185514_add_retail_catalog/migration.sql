-- CreateEnum
CREATE TYPE "PosMode" AS ENUM ('RESTAURANT', 'RETAIL');

-- CreateEnum
CREATE TYPE "VatCategory" AS ENUM ('STANDARD', 'ZERO_RATED', 'EXEMPT');

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "sell_price" DECIMAL(12,2),
ADD COLUMN     "vat_category" "VatCategory" NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "inventory_item_id" TEXT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "pos_mode" "PosMode" NOT NULL DEFAULT 'RESTAURANT';

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_organization_id_barcode_key" ON "inventory_items"("organization_id", "barcode");

-- CreateIndex
CREATE INDEX "order_items_inventory_item_id_idx" ON "order_items"("inventory_item_id");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

