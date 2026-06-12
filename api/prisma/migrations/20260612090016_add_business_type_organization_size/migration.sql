-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "business_type" TEXT,
ADD COLUMN     "organization_size" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "business_role" TEXT;
