-- Phone is no longer required on new customers — walk-in customers who don't want to share a
-- number can still be recorded. The existing (organizationId, phone) unique index is untouched:
-- Postgres treats NULLs as distinct, so multiple no-phone customers don't conflict.
ALTER TABLE "customers" ALTER COLUMN "phone" DROP NOT NULL;
