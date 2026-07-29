-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "result_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idempotency_keys_organization_id_idx" ON "idempotency_keys"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_organization_id_action_key_key" ON "idempotency_keys"("organization_id", "action", "key");

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
