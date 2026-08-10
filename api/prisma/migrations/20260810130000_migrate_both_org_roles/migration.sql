-- BOTH-module orgs (invoicing + POS) also adopt the POS role ladder: STAFF -> WAITER,
-- ACCOUNTANT -> CASHIER. (Invoicing-only orgs are untouched -- they keep STAFF/ACCOUNTANT.)
UPDATE "users"
SET "role" = 'WAITER'
WHERE "role" = 'STAFF'
  AND "organization_id" IN (SELECT "id" FROM "organizations" WHERE "enabled_modules" = 'BOTH');

UPDATE "users"
SET "role" = 'CASHIER'
WHERE "role" = 'ACCOUNTANT'
  AND "organization_id" IN (SELECT "id" FROM "organizations" WHERE "enabled_modules" = 'BOTH');
