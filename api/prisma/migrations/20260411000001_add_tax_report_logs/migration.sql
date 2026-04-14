-- CreateTable
CREATE TABLE "tax_report_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_report_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_report_logs_organization_id_idx" ON "tax_report_logs"("organization_id");

-- AddForeignKey
ALTER TABLE "tax_report_logs" ADD CONSTRAINT "tax_report_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_report_logs" ADD CONSTRAINT "tax_report_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
