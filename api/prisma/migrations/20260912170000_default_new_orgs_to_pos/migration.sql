-- New organizations are now POS-only by default going forward; existing rows
-- keep whatever enabledModules value they already have (column defaults only
-- apply to future INSERTs, never rewrite existing data).
ALTER TABLE "organizations" ALTER COLUMN "enabled_modules" SET DEFAULT 'POS';
