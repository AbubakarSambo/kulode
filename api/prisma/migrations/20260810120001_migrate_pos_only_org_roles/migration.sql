-- Existing POS-only orgs adopt the new role ladder: STAFF -> WAITER, ACCOUNTANT -> CASHIER.
-- (Invoicing-only and BOTH orgs are untouched -- they keep STAFF/ACCOUNTANT.)
UPDATE "users"
SET "role" = 'WAITER'
WHERE "role" = 'STAFF'
  AND "organization_id" IN (SELECT "id" FROM "organizations" WHERE "enabled_modules" = 'POS');

UPDATE "users"
SET "role" = 'CASHIER'
WHERE "role" = 'ACCOUNTANT'
  AND "organization_id" IN (SELECT "id" FROM "organizations" WHERE "enabled_modules" = 'POS');
