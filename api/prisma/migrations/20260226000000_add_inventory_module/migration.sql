-- ============================================================
-- Migration: Add inventory module
-- This migration reconciles the DB with the Prisma schema and
-- adds the new InventoryItem + StockMovement tables.
-- ============================================================

-- Step 1: Drop old inventory-related tables/enums from prior aborted attempt
DROP TABLE IF EXISTS "stock_movements";
DROP TYPE IF EXISTS "StockMovementType";

-- Step 2: Rename products → service_items (undo prior rename migration)
ALTER TABLE "products" RENAME TO "service_items";

-- Step 3: Rename product_id → service_item_id in invoice_items
ALTER TABLE "invoice_items" RENAME COLUMN "product_id" TO "service_item_id";

-- Step 4: Fix the foreign key constraint on invoice_items to point to service_items
ALTER TABLE "invoice_items" DROP CONSTRAINT IF EXISTS "invoice_items_service_item_id_fkey";
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_service_item_id_fkey"
    FOREIGN KEY ("service_item_id") REFERENCES "service_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 5: Rename the index on invoice_items
DROP INDEX IF EXISTS "invoice_items_product_id_idx";
CREATE INDEX IF NOT EXISTS "invoice_items_service_item_id_idx" ON "invoice_items"("service_item_id");

-- Step 6: Drop old subscription_payments table (not in current schema)
DROP TABLE IF EXISTS "subscription_payments";

-- ============================================================
-- New inventory module tables
-- ============================================================

-- Step 7: Create StockMovementType enum
CREATE TYPE "StockMovementType" AS ENUM (
    'RESTOCK',
    'ADJUSTMENT',
    'INVOICE_RESERVED',
    'INVOICE_DEDUCTED',
    'RESERVATION_RELEASED'
);

-- Step 8: Create inventory_items table
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "on_hand_quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reserved_quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reorder_level" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sku" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_items_organization_id_name_key"
    ON "inventory_items"("organization_id", "name");

CREATE INDEX "inventory_items_organization_id_idx"
    ON "inventory_items"("organization_id");

ALTER TABLE "inventory_items"
    ADD CONSTRAINT "inventory_items_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 9: Create stock_movements table
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "on_hand_before" DECIMAL(10,2) NOT NULL,
    "on_hand_after" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_movements_organization_id_idx"
    ON "stock_movements"("organization_id");

CREATE INDEX "stock_movements_inventory_item_id_idx"
    ON "stock_movements"("inventory_item_id");

ALTER TABLE "stock_movements"
    ADD CONSTRAINT "stock_movements_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
    ADD CONSTRAINT "stock_movements_inventory_item_id_fkey"
    FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 10: Add inventory_item_id to invoice_items
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "inventory_item_id" TEXT;

CREATE INDEX IF NOT EXISTS "invoice_items_inventory_item_id_idx"
    ON "invoice_items"("inventory_item_id");

ALTER TABLE "invoice_items"
    ADD CONSTRAINT "invoice_items_inventory_item_id_fkey"
    FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
