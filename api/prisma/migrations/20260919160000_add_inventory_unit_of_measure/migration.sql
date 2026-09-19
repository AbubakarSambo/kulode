-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('KG', 'G', 'L', 'ML', 'UNIT');

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "unit_of_measure" "UnitOfMeasure" NOT NULL DEFAULT 'UNIT';
