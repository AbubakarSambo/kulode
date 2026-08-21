-- Drop the now-unused ORDERS/PAYMENTS values from SheetSyncTab. Postgres has no ALTER TYPE ...
-- DROP VALUE, so the enum is recreated with only the surviving values.
CREATE TYPE "SheetSyncTab_new" AS ENUM ('ORDER_ITEMS', 'WALLET_TRANSACTIONS');

ALTER TABLE "sheet_sync_queue" ALTER COLUMN "tab" TYPE "SheetSyncTab_new"
  USING ("tab"::text::"SheetSyncTab_new");

DROP TYPE "SheetSyncTab";
ALTER TYPE "SheetSyncTab_new" RENAME TO "SheetSyncTab";
