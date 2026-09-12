-- AlterTable
ALTER TABLE "restaurant_tables" ADD COLUMN     "order_type_id" TEXT;

-- CreateIndex
CREATE INDEX "restaurant_tables_order_type_id_idx" ON "restaurant_tables"("order_type_id");

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_order_type_id_fkey" FOREIGN KEY ("order_type_id") REFERENCES "order_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
