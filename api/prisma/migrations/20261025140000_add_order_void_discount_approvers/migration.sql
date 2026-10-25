-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancel_approved_by" TEXT,
ADD COLUMN     "cancelled_by" TEXT,
ADD COLUMN     "discount_approved_by" TEXT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_approved_by_fkey" FOREIGN KEY ("discount_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancel_approved_by_fkey" FOREIGN KEY ("cancel_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

