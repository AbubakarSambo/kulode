-- A user can hold more than one role at once (e.g. Cashier + Waiter) — replaces the single
-- `role` column with a `roles` array. Access becomes the union of what each role would unlock.
ALTER TABLE "users" ADD COLUMN "roles" "UserRole"[] NOT NULL DEFAULT ARRAY['STAFF']::"UserRole"[];

-- Backfill: every existing user keeps their single role as a one-element array.
UPDATE "users" SET "roles" = ARRAY["role"];

ALTER TABLE "users" DROP COLUMN "role";
