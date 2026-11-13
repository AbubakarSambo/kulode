-- AlterTable
ALTER TABLE "loyalty_rewards" ADD COLUMN     "redeemed_food_cost" DECIMAL(12,2),
ADD COLUMN     "redeemed_menu_price" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "loyalty_reward_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "order_items_loyalty_reward_id_key" ON "order_items"("loyalty_reward_id");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_loyalty_reward_id_fkey" FOREIGN KEY ("loyalty_reward_id") REFERENCES "loyalty_rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

