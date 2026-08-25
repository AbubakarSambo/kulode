-- AlterEnum
ALTER TYPE "PrintJobStatus" ADD VALUE 'DISPATCHED';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "print_agent_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_print_agent_token_key" ON "organizations"("print_agent_token");
