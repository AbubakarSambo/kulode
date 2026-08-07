-- CreateEnum
CREATE TYPE "OrgModule" AS ENUM ('POS', 'INVOICING', 'BOTH');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "enabled_modules" "OrgModule" NOT NULL DEFAULT 'BOTH';
