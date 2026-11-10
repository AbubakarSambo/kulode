-- Printer support tooling: which agent build runs on which PC, and the agent's uploaded log.
ALTER TABLE "organizations" ADD COLUMN "print_agent_version" TEXT;
ALTER TABLE "organizations" ADD COLUMN "print_agent_hostname" TEXT;

CREATE TABLE "print_agent_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "print_agent_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "print_agent_logs_organization_id_logged_at_idx" ON "print_agent_logs"("organization_id", "logged_at");

ALTER TABLE "print_agent_logs" ADD CONSTRAINT "print_agent_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
