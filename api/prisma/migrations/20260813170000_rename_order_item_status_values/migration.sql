-- Rename OrderItemStatus values to match the kitchen ticket board's terminology.
-- Existing rows are updated automatically since this renames the enum label in place.
ALTER TYPE "OrderItemStatus" RENAME VALUE 'PREPARING' TO 'ON_IT';
ALTER TYPE "OrderItemStatus" RENAME VALUE 'READY' TO 'PASS';
