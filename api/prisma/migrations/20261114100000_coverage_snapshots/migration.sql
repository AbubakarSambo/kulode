-- CreateTable
CREATE TABLE "coverage_snapshots" (
    "organization_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "customers" INTEGER NOT NULL,
    "with_phone" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coverage_snapshots_pkey" PRIMARY KEY ("organization_id","date")
);

-- AddForeignKey
ALTER TABLE "coverage_snapshots" ADD CONSTRAINT "coverage_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

