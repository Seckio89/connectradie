-- Repair site-visit durations that were stored as the tradie's full
-- availability window (e.g. 9am-7pm = 10 hours) rather than the actual visit.
--
-- The bug was on the client side: when a client booked a site visit by
-- picking one of the tradie's published availability slots, the slot's
-- start_time and end_time (a window of when the tradie was free, not an
-- appointment) were stored verbatim as visit start/end on the quote.
--
-- Result: the tradie saw the entire 10-hour window blocked out on their
-- Site Calendar, and the "Confirm visit time" modal pre-populated with a
-- 600-minute duration that couldn't even be expressed in the dropdown.
--
-- The client-side fix (commit before this migration) defaults every new
-- site-visit booking to 60 minutes. This migration normalises any existing
-- rows that already have the bad data: site visits longer than 4 hours
-- are almost certainly stale availability windows masquerading as visits,
-- so collapse them to a 1-hour appointment starting at the same time.
--
-- Safe to re-run: only touches rows where the duration exceeds 4 hours
-- AND the quote is still in a site-visit status (so we do not rewrite
-- legitimate confirmed long appointments that are about to happen).

UPDATE public.quotes
SET site_visit_ends_at = site_visit_scheduled_at + INTERVAL '1 hour'
WHERE site_visit_scheduled_at IS NOT NULL
  AND site_visit_ends_at IS NOT NULL
  AND site_visit_ends_at - site_visit_scheduled_at > INTERVAL '4 hours'
  AND status IN ('site_visit_scheduled', 'site_visit_completed');
