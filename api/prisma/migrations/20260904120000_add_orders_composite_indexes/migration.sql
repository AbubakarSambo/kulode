-- CreateIndex
CREATE INDEX "orders_organization_id_status_created_at_idx" ON "orders"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "orders_organization_id_table_id_created_at_idx" ON "orders"("organization_id", "table_id", "created_at");
