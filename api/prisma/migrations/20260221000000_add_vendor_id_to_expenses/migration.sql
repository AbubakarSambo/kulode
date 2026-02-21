-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "vendor_id" TEXT;

-- CreateIndex
CREATE INDEX "expenses_vendor_id_idx" ON "expenses"("vendor_id");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
