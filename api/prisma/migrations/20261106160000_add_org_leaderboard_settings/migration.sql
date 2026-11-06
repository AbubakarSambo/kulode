-- Per-org staff leaderboard settings; NULL means the defaults.
ALTER TABLE "organizations" ADD COLUMN "leaderboard_settings" JSONB;
