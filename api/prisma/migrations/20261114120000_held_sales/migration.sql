-- CreateEnum
CREATE TYPE "HeldSaleStatus" AS ENUM ('HELD', 'RECALLED', 'DISCARDED', 'EXPIRED');

-- CreateTable
CREATE TABLE "held_sales" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "held_by" TEXT NOT NULL,
    "label" TEXT,
    "items" JSONB NOT NULL,
    "customer_id" TEXT,
    "status" "HeldSaleStatus" NOT NULL DEFAULT 'HELD',
    "recalled_by" TEXT,
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "held_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "held_sales_organization_id_status_idx" ON "held_sales"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "held_sales" ADD CONSTRAINT "held_sales_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "held_sales" ADD CONSTRAINT "held_sales_held_by_fkey" FOREIGN KEY ("held_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "held_sales" ADD CONSTRAINT "held_sales_recalled_by_fkey" FOREIGN KEY ("recalled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

