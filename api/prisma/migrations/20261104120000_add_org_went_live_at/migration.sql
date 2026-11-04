-- Platform-admin "Go live": marks when an org's pre-launch test activity was cleared.
ALTER TABLE "organizations" ADD COLUMN "went_live_at" TIMESTAMP(3);
ALTER TABLE "organizations" ADD COLUMN "go_live_summary" JSONB;

-- Every org that existed before this feature is already trading, so mark it live (which hides the
-- Go live button). A platform admin reopens any org that is still pre-launch by setting
-- went_live_at back to NULL by hand after deploy.
UPDATE "organizations" SET "went_live_at" = "created_at";
