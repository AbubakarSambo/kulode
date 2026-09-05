-- CreateEnum
CREATE TYPE "MenuCategoryKind" AS ENUM ('FOOD', 'DRINK', 'OTHER');

-- AlterTable
ALTER TABLE "menu_categories" ADD COLUMN     "kind" "MenuCategoryKind" NOT NULL DEFAULT 'FOOD';

