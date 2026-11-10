-- Print agent: heartbeat for the online/offline badge, and a short-lived pairing code the
-- installer swaps for the agent token.
ALTER TABLE "organizations" ADD COLUMN "print_agent_last_seen_at" TIMESTAMP(3);
ALTER TABLE "organizations" ADD COLUMN "print_agent_pairing_code" TEXT;
ALTER TABLE "organizations" ADD COLUMN "print_agent_pairing_expires_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "organizations_print_agent_pairing_code_key" ON "organizations"("print_agent_pairing_code");

-- Test prints from the Printers settings page aren't tied to an order.
ALTER TABLE "print_jobs" ALTER COLUMN "order_id" DROP NOT NULL;
