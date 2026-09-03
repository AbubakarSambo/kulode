-- What this restaurant considers one business day (e.g. "06:00"-"18:00"), used by reports and
-- dashboards to bucket "today"/daily figures instead of literal midnight. Defaults to full
-- midnight-to-midnight so existing orgs' report output is unchanged until an admin sets hours.
ALTER TABLE "organizations" ADD COLUMN "shift_start_time" TEXT NOT NULL DEFAULT '00:00';
ALTER TABLE "organizations" ADD COLUMN "shift_end_time" TEXT NOT NULL DEFAULT '23:59';
