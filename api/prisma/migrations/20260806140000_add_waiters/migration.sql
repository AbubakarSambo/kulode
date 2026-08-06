-- CreateTable
CREATE TABLE "waiters" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waiters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waiters_organization_id_idx" ON "waiters"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "waiters_organization_id_name_key" ON "waiters"("organization_id", "name");

-- AddForeignKey
ALTER TABLE "waiters" ADD CONSTRAINT "waiters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
