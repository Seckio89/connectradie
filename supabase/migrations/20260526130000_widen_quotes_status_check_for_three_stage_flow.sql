-- The 3-stage quote flow (migration 20260516120000) added the workflow columns
-- (site_visit_scheduled_at, final_submitted_at, …) but never widened the
-- quotes.status CHECK constraint to allow the new status values. As a result every
-- attempt to advance a quote into the 3-stage states was rejected at the database
-- level with a check_violation — silently, because the stripe-webhook acks Stripe
-- with 200 regardless of the update outcome. This widens the constraint to cover
-- the full state machine in docs/three-stage-quote-flow.md.

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_status_check;

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'site_visit_scheduled'::text,
    'site_visit_completed'::text,
    'final_submitted'::text,
    'accepted'::text,
    'declined'::text,
    'withdrawn'::text,
    'expired'::text
  ]));
