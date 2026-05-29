-- Adds the columns and flag needed for the 3-stage quote flow:
--   stage 1: estimate (status='pending')
--   stage 2: site visit (status='site_visit_scheduled' / 'site_visit_completed')
--   stage 3: final binding quote (status='final_submitted', final_price set)
--   stage 4: client picks one — escrow lands here (status='accepted')
--
-- The legacy single-step accept-and-pay flow is preserved when jobs.flow_version = 1
-- (the default). New jobs that opt into the 3-stage flow get flow_version = 2.
-- This means nothing in production behaviour changes until a job is created with
-- flow_version = 2, so this migration is safe to deploy ahead of any UI work.

-- ── jobs.flow_version ─────────────────────────────────────────────────────────
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS flow_version smallint NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.jobs.flow_version IS
  '1 = legacy single-step accept-and-pay flow. 2 = 3-stage estimate / site visit / final quote / pay flow. Defaults to 1 so existing jobs are unaffected.';

-- ── quotes: site-visit + final-quote tracking ─────────────────────────────────
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS site_visit_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS site_visit_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_submitted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS final_valid_until       date;

COMMENT ON COLUMN public.quotes.site_visit_scheduled_at IS
  'When the client booked the site visit (book-site-visit edge function). Quote status: pending -> site_visit_scheduled.';

COMMENT ON COLUMN public.quotes.site_visit_completed_at IS
  'When the tradie marked the site visit done. Quote status: site_visit_scheduled -> site_visit_completed.';

COMMENT ON COLUMN public.quotes.final_submitted_at IS
  'When the tradie submitted the binding final quote (final_price set). Status: site_visit_completed -> final_submitted. Quotes that did not require a site visit can have this set at submission time.';

COMMENT ON COLUMN public.quotes.final_valid_until IS
  'Date after which a final quote expires if not accepted by the client. ACL: binding quotes need a clear validity period.';

-- Speed up "open quotes per job" lookups used by the compare-final-quotes view.
CREATE INDEX IF NOT EXISTS quotes_job_status_idx ON public.quotes (job_id, status);
