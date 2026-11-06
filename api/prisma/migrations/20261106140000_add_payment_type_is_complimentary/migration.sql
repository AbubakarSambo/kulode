-- Marks a payment type as complimentary (a comp): excluded from sales, reported on its own line.
ALTER TABLE "payment_types" ADD COLUMN "is_complimentary" BOOLEAN NOT NULL DEFAULT false;

-- One-off backfill so reports are right from the first deploy. Matches the types orgs already use
-- for comps ("LR Complimentary", "YD Complimentary", "COMPLIMENTARY"); from here on the flag, not
-- the name, decides.
UPDATE "payment_types" SET "is_complimentary" = true WHERE "name" ILIKE '%complimentary%';
