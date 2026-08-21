-- Drop the now-unused ORDERS/PAYMENTS values from SheetSyncTab. Postgres has no ALTER TYPE ...
-- DROP VALUE, so the enum is recreated with only the surviving values. Any queue rows still
-- tagged with the retired tabs are discarded first — they're outbox entries for a sync target
-- that no longer exists, not user-facing data.
DELETE FROM "sheet_sync_queue" WHERE "tab" IN ('ORDERS', 'PAYMENTS');

CREATE TYPE "SheetSyncTab_new" AS ENUM ('ORDER_ITEMS', 'WALLET_TRANSACTIONS');

ALTER TABLE "sheet_sync_queue" ALTER COLUMN "tab" TYPE "SheetSyncTab_new"
  USING ("tab"::text::"SheetSyncTab_new");

DROP TYPE "SheetSyncTab";
ALTER TYPE "SheetSyncTab_new" RENAME TO "SheetSyncTab";
