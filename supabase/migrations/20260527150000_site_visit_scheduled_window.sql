-- Real scheduling for the call-out-fee site visit.
--
-- site_visit_scheduled_at previously stored the *payment* timestamp. It now stores
-- the actual chosen visit start. These columns add the end of the window and a
-- confirmation flag, mirroring jobs.start_time/end_time/time_confirmed:
--   • site_visit_ends_at        — end of the visit block (start + duration)
--   • site_visit_time_confirmed — false when the client proposed a time (tradie has
--     no published availability), true when picked from the tradie's open slots or
--     confirmed by the tradie afterwards.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS site_visit_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS site_visit_time_confirmed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.quotes.site_visit_scheduled_at IS
  'Actual chosen start of the site visit (client picks before paying the call-out fee).';
COMMENT ON COLUMN public.quotes.site_visit_ends_at IS
  'Estimated end of the site-visit window (start + duration).';
COMMENT ON COLUMN public.quotes.site_visit_time_confirmed IS
  'True when the visit time is locked (picked from tradie availability or tradie-confirmed); false = client proposal awaiting confirmation.';
