-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "assigned_to_id" TEXT;

-- CreateIndex
CREATE INDEX "order_items_assigned_to_id_idx" ON "order_items"("assigned_to_id");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
