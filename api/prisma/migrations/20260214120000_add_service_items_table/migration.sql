-- CreateTable
CREATE TABLE "service_items" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_items_organization_id_idx" ON "service_items"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_items_organization_id_name_key" ON "service_items"("organization_id", "name");

-- AddForeignKey
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
