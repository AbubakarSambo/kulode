-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "waiter_id" TEXT;

-- CreateIndex
CREATE INDEX "orders_waiter_id_idx" ON "orders"("waiter_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_waiter_id_fkey" FOREIGN KEY ("waiter_id") REFERENCES "waiters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
