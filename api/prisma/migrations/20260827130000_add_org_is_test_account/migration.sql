-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "is_test_account" BOOLEAN NOT NULL DEFAULT false;

-- One-time backfill: flag the team's own test/QA orgs (email starts with samboabubakar5) so
-- they're excluded from platform-admin analytics going forward. Going forward this is a toggle
-- in the platform admin org edit view, not a live email match.
UPDATE "organizations" SET "is_test_account" = true WHERE "email" ILIKE 'samboabubakar5%';
