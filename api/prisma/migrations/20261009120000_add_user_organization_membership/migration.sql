-- CreateTable
CREATE TABLE "user_organizations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "roles" "UserRole"[] DEFAULT ARRAY['STAFF']::"UserRole"[],
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_organizations_organization_id_idx" ON "user_organizations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_organizations_user_id_organization_id_key" ON "user_organizations"("user_id", "organization_id");

-- AddForeignKey
ALTER TABLE "user_organizations" ADD CONSTRAINT "user_organizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organizations" ADD CONSTRAINT "user_organizations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: give every existing user a membership row mirroring their current primary org/roles,
-- so UserOrganization becomes additive (no behavior change) until the switch-org endpoint ships.
INSERT INTO "user_organizations" ("id", "user_id", "organization_id", "roles", "is_default", "created_at", "updated_at")
SELECT gen_random_uuid()::text, "id", "organization_id", "roles", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT ("user_id", "organization_id") DO NOTHING;
