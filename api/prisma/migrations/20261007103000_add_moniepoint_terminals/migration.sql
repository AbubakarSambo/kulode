-- CreateTable
CREATE TABLE "moniepoint_terminals" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moniepoint_terminals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moniepoint_terminals_organization_id_idx" ON "moniepoint_terminals"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "moniepoint_terminals_organization_id_serial_key" ON "moniepoint_terminals"("organization_id", "serial");

-- AddForeignKey
ALTER TABLE "moniepoint_terminals" ADD CONSTRAINT "moniepoint_terminals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every org that already had a single terminal serial gets a corresponding row here,
-- labeled "Default Terminal" so existing setups keep working unchanged after the column drop below.
INSERT INTO "moniepoint_terminals" ("id", "organization_id", "serial", "label", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", "moniepoint_terminal_serial", 'Default Terminal', true, now(), now()
FROM "organizations"
WHERE "moniepoint_terminal_serial" IS NOT NULL;

-- AlterTable
ALTER TABLE "organizations" DROP COLUMN "moniepoint_terminal_serial";
