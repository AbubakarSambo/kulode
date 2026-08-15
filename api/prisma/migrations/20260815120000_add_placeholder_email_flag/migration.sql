-- Flags an auto-generated internal email (PIN-eligible staff created without a real address)
-- so the UI can avoid treating it as a real invite/verification target.
ALTER TABLE "users" ADD COLUMN "has_placeholder_email" BOOLEAN NOT NULL DEFAULT false;
