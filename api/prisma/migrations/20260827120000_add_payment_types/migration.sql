-- CreateTable
CREATE TABLE "payment_types" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_types_organization_id_idx" ON "payment_types"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_types_organization_id_name_key" ON "payment_types"("organization_id", "name");

-- AddForeignKey
ALTER TABLE "payment_types" ADD CONSTRAINT "payment_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the 4 default payment types for every existing POS/BOTH org, using the SAME literal
-- codes Payment.payment_method has always stored (CASH, BANK_TRANSFER, CARD, OTHER) — no
-- renaming, so existing/invoicing rows written with these codes stay valid and consistent.
-- PAYSTACK and WALLET are deliberately never seeded here — they stay hardcoded/protected.
INSERT INTO "payment_types" ("id", "organization_id", "name", "sort_order", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), o."id", t.name, t.sort_order, true, now(), now()
FROM "organizations" o
CROSS JOIN (
    VALUES
        ('CASH', 0),
        ('BANK_TRANSFER', 1),
        ('CARD', 2),
        ('OTHER', 3)
) AS t(name, sort_order)
WHERE o."enabled_modules" IN ('POS', 'BOTH');

-- AlterTable: convert payments.payment_method from the PaymentMethod enum to plain text,
-- preserving existing values exactly (no renaming — Expense.payment_method still uses this
-- enum type, so it is NOT dropped here).
ALTER TABLE "payments" ALTER COLUMN "payment_method" TYPE TEXT USING "payment_method"::TEXT;
