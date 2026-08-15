-- Adds a hashed quick-login PIN for shared POS terminals (waiter/pass/runner/cashier roles).
-- Set by an admin via Settings > Users, distinct from the user's own password.
ALTER TABLE "users" ADD COLUMN "pin_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "pin_set_at" TIMESTAMP(3);
