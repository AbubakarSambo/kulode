-- Add client_type column to clients
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "client_type" TEXT DEFAULT 'business';

-- Add STARTER variant to PlanTier enum
ALTER TYPE "PlanTier" ADD VALUE IF NOT EXISTS 'STARTER';

-- Create short_links table
CREATE TABLE IF NOT EXISTS "short_links" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "short_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "short_links_slug_key" ON "short_links"("slug");
