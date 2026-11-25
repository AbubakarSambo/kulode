-- A tip the guest has said they will add when they pay on the Moniepoint terminal or by transfer.
-- Those payments close the order from a webhook, so the tip has to be known beforehand.
ALTER TABLE "orders" ADD COLUMN "pending_tip_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- A tip recorded by a Moniepoint webhook has no user behind it.
ALTER TABLE "tips" ALTER COLUMN "recorded_by" DROP NOT NULL;
