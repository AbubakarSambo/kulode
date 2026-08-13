-- Optional expected prep time (minutes) on a menu item, used to drive the
-- countdown timer on the kitchen ticket board.
ALTER TABLE "menu_items" ADD COLUMN "duration_minutes" INTEGER;
