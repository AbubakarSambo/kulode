-- CreateTable
CREATE TABLE "payment_installments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "percentage" DECIMAL(5,2),
    "amount" DECIMAL(12,2) NOT NULL,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "paystack_reference" TEXT,
    "paystack_access_code" TEXT,
    "payment_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_installments_paystack_reference_key" ON "payment_installments"("paystack_reference");

-- CreateIndex
CREATE INDEX "payment_installments_invoice_id_idx" ON "payment_installments"("invoice_id");

-- AddForeignKey
ALTER TABLE "payment_installments" ADD CONSTRAINT "payment_installments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
