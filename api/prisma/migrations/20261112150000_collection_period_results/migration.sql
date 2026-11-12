-- Frozen outcome of a locked phone-collection period, one row per person, as the basis for payroll.

CREATE TYPE "CollectionZone" AS ENUM ('RED', 'NORMAL', 'GREEN');

CREATE TABLE "collection_period_results" (
  "id" TEXT NOT NULL,
  "period_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "minimum" INTEGER NOT NULL,
  "threshold" INTEGER NOT NULL,
  "zone" "CollectionZone" NOT NULL,
  "incentive_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "deduction_pct" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collection_period_results_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "collection_period_results_period_id_user_id_key" ON "collection_period_results"("period_id", "user_id");
ALTER TABLE "collection_period_results" ADD CONSTRAINT "collection_period_results_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "collection_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
