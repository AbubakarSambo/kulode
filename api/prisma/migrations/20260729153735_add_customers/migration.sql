-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "customer_id" TEXT;

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_organization_id_idx" ON "customers"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_organization_id_phone_key" ON "customers"("organization_id", "phone");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
