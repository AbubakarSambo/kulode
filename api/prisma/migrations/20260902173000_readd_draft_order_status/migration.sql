-- AlterEnum
-- IF NOT EXISTS: production already has this value from a migration whose folder was removed
-- during a revert; this makes the statement safe to (re-)apply in any environment.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
