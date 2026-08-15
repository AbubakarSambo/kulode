-- A second, stackable tax type (e.g. state consumption/entertainment tax) alongside VAT,
-- toggled per order on the Sell screen rather than always-applied org-wide.
ALTER TABLE "organizations" ADD COLUMN "entertainment_tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "organizations" ADD COLUMN "entertainment_tax_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Per-order breakdown, decided once at creation so later settings changes don't retroactively
-- alter an already-placed order's charges.
ALTER TABLE "orders" ADD COLUMN "vat_applied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "entertainment_tax_applied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "vat_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "entertainment_tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Backfill: every order created before this migration had exactly one tax type (VAT), so its
-- existing tax_amount is entirely VAT.
UPDATE "orders" SET "vat_amount" = "tax_amount", "vat_applied" = true WHERE "tax_amount" > 0;

