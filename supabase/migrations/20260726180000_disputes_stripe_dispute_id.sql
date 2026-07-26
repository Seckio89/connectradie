-- Migration: disputes_stripe_dispute_id
-- Description:
--   Audit H5. A Stripe CHARGEBACK did not stop the auto-release cron paying the
--   tradie, so the platform could lose the money twice.
--
--   stripe-webhook's charge.dispute.created handler deliberately wrote no
--   disputes row — "Cannot insert a dispute record without job/user context from
--   Stripe dispute alone" (index.ts:526) — it only logged and notified admins.
--   But auto-release-payments builds its exclusion set purely from
--   public.disputes (index.ts:118-126), so a chargeback never reached the gate:
--
--     09:00  $5,000 job completes
--     11:00  client files a chargeback; Stripe debits the platform $5,000 + fee
--     14:00  the 5-hour cron sees no disputes row and pays the tradie $5,000
--            -> ~$5,025 gone, with no recovery path
--
--   The context IS derivable, which is what makes the original comment wrong:
--     dispute.charge -> charge.payment_intent
--       -> payments.stripe_payment_intent_id -> payments.job_id
--       -> jobs.client_id (opened_by) and jobs.tradie_id (against_user)
--
--   This column links our row back to the Stripe object so the webhook can be
--   idempotent on redelivery AND can find the row again when the dispute CLOSES.
--   That second half matters: disputes.status 'open' blocks auto-release, so
--   without closure handling a dispute the tradie WINS would block their payout
--   forever. charge.dispute.closed now resolves it (won -> resolved_tradie,
--   which auto-release no longer excludes; lost -> resolved_client, which stays
--   excluded because the money is already gone).

ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS stripe_dispute_id text;

-- Partial unique index: our own in-app disputes have no Stripe id and must not
-- collide with each other on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS disputes_stripe_dispute_id_key
  ON public.disputes (stripe_dispute_id)
  WHERE stripe_dispute_id IS NOT NULL;

COMMENT ON COLUMN public.disputes.stripe_dispute_id IS
  'Stripe dispute (chargeback) id when this row was raised by charge.dispute.created. NULL for in-app disputes.';
