-- Waiter directory entries (name/phone/notes, no login) are merged into User (role WAITER) so
-- there's exactly one record per floor-staff person instead of two disconnected ones — creating
-- a WAITER-role login account previously didn't add them to the Waiters directory, and vice
-- versa. Waiter.id is reused as the new User.id so Order.waiter_id never needs remapping, only
-- its FK target changes.

ALTER TABLE "users" ADD COLUMN "phone" TEXT;
ALTER TABLE "users" ADD COLUMN "notes" TEXT;

-- Backfill: one User per existing Waiter row, keeping the same id. Placeholder email mirrors the
-- app's own generated shape, built from the waiter's own id (already unique) so no collision
-- handling is needed.
INSERT INTO "users" (
  "id", "organization_id", "email", "first_name", "last_name", "roles",
  "phone", "notes", "is_active", "has_placeholder_email", "created_at", "updated_at"
)
SELECT
  w."id",
  w."organization_id",
  lower(regexp_replace(w."name", '[^a-zA-Z0-9]+', '.', 'g')) || '-' || substr(w."id", 1, 8)
    || '@' || o."slug" || '.internal',
  split_part(w."name", ' ', 1),
  CASE WHEN position(' ' in w."name") > 0
    THEN substr(w."name", position(' ' in w."name") + 1)
    ELSE ''
  END,
  ARRAY['WAITER']::"UserRole"[],
  w."phone",
  w."notes",
  w."is_active",
  true,
  w."created_at",
  w."updated_at"
FROM "waiters" w
JOIN "organizations" o ON o."id" = w."organization_id";

-- Re-point Order.waiter_id at users instead of the (about to be dropped) waiters table.
ALTER TABLE "orders" DROP CONSTRAINT "orders_waiter_id_fkey";
ALTER TABLE "orders" ADD CONSTRAINT "orders_waiter_id_fkey"
  FOREIGN KEY ("waiter_id") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL;

DROP TABLE "waiters";
