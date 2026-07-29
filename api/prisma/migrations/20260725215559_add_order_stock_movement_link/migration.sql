-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'ORDER_DEDUCTED';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "order_id" TEXT;

-- CreateIndex
CREATE INDEX "stock_movements_order_id_idx" ON "stock_movements"("order_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
