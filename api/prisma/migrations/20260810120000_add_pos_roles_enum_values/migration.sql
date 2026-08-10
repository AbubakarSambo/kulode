-- Add POS-only-org role values to UserRole. These are separate from STAFF/ACCOUNTANT
-- (which stay reserved for invoicing/BOTH orgs) — see roles.decorator.ts.
ALTER TYPE "UserRole" ADD VALUE 'MANAGER';
ALTER TYPE "UserRole" ADD VALUE 'SUPERVISOR';
ALTER TYPE "UserRole" ADD VALUE 'CASHIER';
ALTER TYPE "UserRole" ADD VALUE 'WAITER';
