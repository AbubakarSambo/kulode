-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "rc_number" TEXT;

-- CreateTable
CREATE TABLE "organization_directors" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "forenames" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "former_name" TEXT,
    "is_non_nigerian" BOOLEAN NOT NULL DEFAULT false,
    "nationality" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_directors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_directors_organization_id_idx" ON "organization_directors"("organization_id");

-- AddForeignKey
ALTER TABLE "organization_directors" ADD CONSTRAINT "organization_directors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
