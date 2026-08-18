-- Applied at payment time, not order creation — mirrors the Invoice discount pattern (pre-tax:
-- subtotal - discountAmount, tax/service charge computed on the remainder). Reason + who applied
-- it are required by the application layer for audit — an unrestricted till-side discount is a
-- fraud vector.
ALTER TABLE "orders" ADD COLUMN "discount_type" TEXT NOT NULL DEFAULT 'PERCENTAGE';
ALTER TABLE "orders" ADD COLUMN "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "discount_reason" TEXT;
ALTER TABLE "orders" ADD COLUMN "discount_applied_by" TEXT;

ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_applied_by_fkey"
  FOREIGN KEY ("discount_applied_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
