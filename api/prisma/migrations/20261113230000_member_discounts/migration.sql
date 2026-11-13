-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "member_discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "member_discounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate_pct" DECIMAL(5,2) NOT NULL,
    "menu_item_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_discounts_organization_id_idx" ON "member_discounts"("organization_id");

-- AddForeignKey
ALTER TABLE "member_discounts" ADD CONSTRAINT "member_discounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

