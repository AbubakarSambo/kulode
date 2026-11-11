-- Bills/receipts can be sent to a printer through the print agent, like dockets already are.
ALTER TABLE "printers" ADD COLUMN "prints_bills" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "printers" ADD COLUMN "paper_width_mm" INTEGER NOT NULL DEFAULT 80;
