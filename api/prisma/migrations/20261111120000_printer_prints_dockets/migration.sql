-- A printer can be excluded from kitchen/bar dockets (a bills-only printer). On for every
-- existing printer, so nothing changes until someone turns it off.
ALTER TABLE "printers" ADD COLUMN "prints_dockets" BOOLEAN NOT NULL DEFAULT true;
