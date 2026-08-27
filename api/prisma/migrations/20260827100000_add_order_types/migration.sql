-- CreateTable
CREATE TABLE "order_types" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "requires_table" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_types_organization_id_idx" ON "order_types"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_types_organization_id_name_key" ON "order_types"("organization_id", "name");

-- AddForeignKey
ALTER TABLE "order_types" ADD CONSTRAINT "order_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the 4 default order types for every existing POS/BOTH org, matching the old
-- OrderSource enum values — "Dine In" is the only one that requires a table.
INSERT INTO "order_types" ("id", "organization_id", "name", "sort_order", "is_active", "requires_table", "created_at", "updated_at")
SELECT gen_random_uuid(), o."id", t.name, t.sort_order, true, t.requires_table, now(), now()
FROM "organizations" o
CROSS JOIN (
    VALUES
        ('Dine In', 0, true),
        ('Takeaway', 1, false),
        ('Delivery', 2, false),
        ('Third Party', 3, false)
) AS t(name, sort_order, requires_table)
WHERE o."enabled_modules" IN ('POS', 'BOTH');

-- AlterTable: convert orders.source from the OrderSource enum to plain text, preserving
-- existing values (cast keeps the raw enum codes, e.g. 'DINE_IN', intact for the backfill below).
ALTER TABLE "orders" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "source" TYPE TEXT USING "source"::TEXT;
ALTER TABLE "orders" ALTER COLUMN "source" SET DEFAULT 'Dine In';

-- Backfill historical orders from the old enum codes to the new friendly names, so
-- every order (old and new) stores the same human-readable value going forward.
UPDATE "orders" SET "source" = CASE "source"
    WHEN 'DINE_IN' THEN 'Dine In'
    WHEN 'TAKEAWAY' THEN 'Takeaway'
    WHEN 'DELIVERY' THEN 'Delivery'
    WHEN 'THIRD_PARTY' THEN 'Third Party'
    ELSE "source"
END
WHERE "source" IN ('DINE_IN', 'TAKEAWAY', 'DELIVERY', 'THIRD_PARTY');

-- DropEnum
DROP TYPE "OrderSource";
