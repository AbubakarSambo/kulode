-- Separate POS AI chat threads from invoicing AI chat threads.
-- See api/src/modules/ai/ai.service.ts (chat context parameter).
CREATE TYPE "ChatContext" AS ENUM ('INVOICING', 'POS');

ALTER TABLE "chat_sessions" ADD COLUMN "context" "ChatContext" NOT NULL DEFAULT 'INVOICING';

DROP INDEX "chat_sessions_organization_id_user_id_idx";

CREATE INDEX "chat_sessions_organization_id_user_id_context_idx" ON "chat_sessions"("organization_id", "user_id", "context");
