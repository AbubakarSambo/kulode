-- Printer discovery: the print agent scans the local network and reports what it finds.
ALTER TABLE "organizations" ADD COLUMN "print_agent_scan_requested_at" TIMESTAMP(3);
ALTER TABLE "organizations" ADD COLUMN "print_agent_discovered" JSONB;
ALTER TABLE "organizations" ADD COLUMN "print_agent_discovered_at" TIMESTAMP(3);

-- A network printer's hardware address, so a changed IP can be corrected automatically.
ALTER TABLE "printers" ADD COLUMN "mac_address" TEXT;
