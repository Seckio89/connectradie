-- Allow the payout sweep + webhook to record terminal failure reasons on
-- recurring_invoices.payout_status. Previously only NULL, 'transferred', and
-- 'held_onboarding_incomplete' were allowed, so a Stripe transfer failure or
-- a missing Connect account had no observable record: the invoice sat at
-- status='paid' with payout_status=NULL forever, with no way for support or
-- the sweep cron to distinguish "never attempted" from "attempted and failed".
--
-- New terminal values:
--   held_no_connect      — tradie has no Connect account / onboarding incomplete
--   held_transfer_error  — stripe.transfers.create threw at webhook time
--
-- Both states remain pickable by the sweep cron (NULL or held_* + status=paid)
-- so they retry until success or manual intervention.

ALTER TABLE public.recurring_invoices
  DROP CONSTRAINT IF EXISTS recurring_invoices_payout_status_check;

ALTER TABLE public.recurring_invoices
  ADD CONSTRAINT recurring_invoices_payout_status_check
  CHECK (
    payout_status IS NULL
    OR payout_status = ANY (ARRAY[
      'transferred'::text,
      'held_onboarding_incomplete'::text,
      'held_no_connect'::text,
      'held_transfer_error'::text
    ])
  );
