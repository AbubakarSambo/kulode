-- CreateTable
CREATE TABLE "shift_payment_breakdowns" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "expected_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "counted_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "variance" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "shift_payment_breakdowns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_payment_breakdowns_shift_id_idx" ON "shift_payment_breakdowns"("shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "shift_payment_breakdowns_shift_id_payment_method_key" ON "shift_payment_breakdowns"("shift_id", "payment_method");

-- AddForeignKey
ALTER TABLE "shift_payment_breakdowns" ADD CONSTRAINT "shift_payment_breakdowns_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

