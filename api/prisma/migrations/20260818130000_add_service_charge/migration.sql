-- A gratuity/service fee, not a tax — same stackable, per-order-toggleable pattern as
-- entertainment tax, but kept out of tax_amount and added to the order total separately.
ALTER TABLE "organizations" ADD COLUMN "service_charge_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "organizations" ADD COLUMN "service_charge_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Per-order breakdown, decided once at creation so later settings changes don't retroactively
-- alter an already-placed order's charges. No backfill needed — this is a new charge type, so
-- every existing order correctly has none applied.
ALTER TABLE "orders" ADD COLUMN "service_charge_applied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "service_charge_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
