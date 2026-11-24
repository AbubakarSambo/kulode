-- A business has exactly one default reminder policy (client_id NULL). The existing
-- UNIQUE (organization_id, client_id) does not enforce that, because NULLs are distinct in Postgres.
-- Prisma cannot express a partial index, so it lives here only.

-- Keep the oldest default policy per business if a race already created more than one.
DELETE FROM "invoice_collection_policies" p
USING "invoice_collection_policies" older
WHERE p."client_id" IS NULL
  AND older."client_id" IS NULL
  AND p."organization_id" = older."organization_id"
  AND (older."created_at", older."id") < (p."created_at", p."id");

CREATE UNIQUE INDEX "invoice_collection_policies_one_default_per_org"
  ON "invoice_collection_policies" ("organization_id")
  WHERE "client_id" IS NULL;
